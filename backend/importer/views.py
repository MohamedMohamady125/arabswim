import os
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.cache import cache

from .services import parse_file, match_swimmers_preview, confirm_import
from .matcher import find_potential_duplicates, merge_swimmers
from .models import ImportLog
from swimmers.models import Swimmer
from championships.models import Championship, Result


class FileUploadView(APIView):
    """
    Step 1: Upload a results file, parse it, and return a preview.
    POST /api/v1/import/upload/
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        try:
            preview = parse_file(uploaded_file=file)

            # Store preview in cache for subsequent steps
            import uuid
            import_id = str(uuid.uuid4())
            cache.set(f'import_{import_id}', json.dumps(preview, default=str), timeout=3600)

            # Log the import attempt
            ImportLog.objects.create(
                file_name=file.name,
                file_type=os.path.splitext(file.name)[1].lower().strip('.'),
                source_format=preview['meet'].get('format', 'unknown'),
                meet_name=preview['meet'].get('name', ''),
                total_results=preview['stats']['total_results'],
                status='pending',
            )

            # Check for existing meets that might be duplicates
            meet_warnings = _check_meet_duplicates(preview)

            return Response({
                'import_id': import_id,
                'meet_warnings': meet_warnings,
                **preview,
            })

        except Exception as e:
            ImportLog.objects.create(
                file_name=file.name,
                file_type=os.path.splitext(file.name)[1].lower().strip('.'),
                status='failed',
                error_message=str(e),
            )
            return Response({'error': str(e)}, status=400)


class MatchSwimmersView(APIView):
    """
    Step 2: Match extracted swimmers against the database.
    POST /api/v1/import/match/
    Body: { import_id: "..." }
    """
    def post(self, request):
        import_id = request.data.get('import_id')
        if not import_id:
            return Response({'error': 'import_id required'}, status=400)

        preview_json = cache.get(f'import_{import_id}')
        if not preview_json:
            return Response({'error': 'Import session expired. Please upload again.'}, status=404)

        preview = json.loads(preview_json)
        matches = match_swimmers_preview(preview)

        return Response({
            'import_id': import_id,
            'matches': matches,
            'stats': {
                'total': len(matches),
                'exact_matches': sum(1 for m in matches if m['match_type'] == 'exact'),
                'fuzzy_matches': sum(1 for m in matches if m['match_type'] == 'fuzzy'),
                'new_swimmers': sum(1 for m in matches if m['match_type'] == 'new'),
            }
        })


class ConfirmImportView(APIView):
    """
    Step 3: Confirm the import with swimmer decisions.
    POST /api/v1/import/confirm/
    Body: {
        import_id: "...",
        championship_id: int (optional),
        swimmer_decisions: {
            "SWIMMER NAME": { action: "match"|"create"|"skip", swimmer_id: int }
        }
    }
    """
    def post(self, request):
        import_id = request.data.get('import_id')
        championship_id = request.data.get('championship_id')
        championship_details = request.data.get('championship_details')
        swimmer_decisions = request.data.get('swimmer_decisions', {})

        if not import_id:
            return Response({'error': 'import_id required'}, status=400)

        preview_json = cache.get(f'import_{import_id}')
        if not preview_json:
            return Response({'error': 'Import session expired. Please upload again.'}, status=404)

        preview = json.loads(preview_json)

        # Allow frontend to send edited preview data
        modified_preview = request.data.get('modified_preview')
        if modified_preview:
            from .parsers.base import parse_time_to_centiseconds
            # Re-parse time_text to time_centiseconds for any edited results
            for event in modified_preview.get('events', []):
                for result in event.get('results', []):
                    time_text = result.get('time_text', '')
                    if time_text:
                        result['time_centiseconds'] = parse_time_to_centiseconds(time_text)
            preview = modified_preview

        try:
            result = confirm_import(preview, swimmer_decisions, championship_id, championship_details)

            # Update import log
            ImportLog.objects.filter(
                file_name__icontains=preview['meet'].get('name', '')[:50],
                status='pending',
            ).update(
                status='completed',
                championship_id=result['championship_id'],
                created_swimmers=result['created_swimmers'],
                matched_swimmers=result['matched_swimmers'],
                created_results=result['created_results'],
            )

            # Clean up cache
            cache.delete(f'import_{import_id}')

            return Response(result)

        except Exception as e:
            return Response({'error': str(e)}, status=400)


class DuplicateSwimmersView(APIView):
    """
    Find potential duplicate swimmers in the database.
    GET /api/v1/import/duplicates/
    """
    def get(self, request):
        duplicates = find_potential_duplicates()
        data = []
        for s1, s2, score in duplicates[:50]:  # Limit to top 50
            data.append({
                'swimmer1': {
                    'id': s1.id, 'name': s1.name,
                    'nationality': s1.nationality.name,
                    'date_of_birth': str(s1.date_of_birth),
                },
                'swimmer2': {
                    'id': s2.id, 'name': s2.name,
                    'nationality': s2.nationality.name,
                    'date_of_birth': str(s2.date_of_birth),
                },
                'similarity': score,
            })
        return Response(data)


class MergeSwimmersView(APIView):
    """
    Merge two duplicate swimmers.
    POST /api/v1/import/merge/
    Body: { keep_id: int, remove_id: int }
    """
    def post(self, request):
        keep_id = request.data.get('keep_id')
        remove_id = request.data.get('remove_id')

        if not keep_id or not remove_id:
            return Response({'error': 'keep_id and remove_id required'}, status=400)

        try:
            keep = Swimmer.objects.get(id=keep_id)
            remove = Swimmer.objects.get(id=remove_id)
            merged = merge_swimmers(keep, remove)
            return Response({
                'message': f'Merged "{remove.name}" into "{keep.name}"',
                'swimmer_id': merged.id,
            })
        except Swimmer.DoesNotExist:
            return Response({'error': 'Swimmer not found'}, status=404)


class ImportHistoryView(APIView):
    """
    GET /api/v1/import/history/
    """
    def get(self, request):
        logs = ImportLog.objects.all()[:50]
        data = []
        for log in logs:
            data.append({
                'id': log.id,
                'file_name': log.file_name,
                'file_type': log.file_type,
                'source_format': log.source_format,
                'meet_name': log.meet_name,
                'total_results': log.total_results,
                'created_swimmers': log.created_swimmers,
                'matched_swimmers': log.matched_swimmers,
                'created_results': log.created_results,
                'status': log.status,
                'error_message': log.error_message,
                'created_at': log.created_at,
            })
        return Response(data)


def _check_meet_duplicates(preview):
    """
    Check if this meet already exists in the database.
    Returns a list of warnings describing what was found.
    """
    from thefuzz import fuzz

    meet_info = preview.get('meet', {})
    meet_name = meet_info.get('name', '').strip()
    meet_date = meet_info.get('date', '')
    meet_pool = meet_info.get('pool', '')

    if not meet_name:
        return []

    warnings = []

    # Find championships with similar name
    matches = []
    for champ in Championship.objects.all():
        name_score = fuzz.token_sort_ratio(meet_name.upper(), champ.name.upper())
        if name_score >= 80:
            matches.append(champ)

    if not matches:
        return []

    # Analyze each matching championship
    parsed_events = {ev.get('event_name', '') for ev in preview.get('events', [])}

    for champ in matches:
        db_results = champ.results.select_related('event')
        db_result_count = db_results.count()
        db_events = set(db_results.values_list('event__name', flat=True).distinct())
        db_swimmer_count = db_results.values('swimmer').distinct().count()

        same_date = str(champ.date) == meet_date if meet_date and champ.date else False
        same_pool = meet_pool == champ.pool if meet_pool else True

        new_events = parsed_events - db_events
        overlapping_events = parsed_events & db_events

        warning = {
            'championship_id': champ.id,
            'championship_name': champ.name,
            'championship_date': str(champ.date),
            'championship_pool': champ.pool,
            'db_results': db_result_count,
            'db_events': len(db_events),
            'db_swimmers': db_swimmer_count,
        }

        if same_date and same_pool and overlapping_events and not new_events:
            warning['type'] = 'exact_duplicate'
            warning['message'] = (
                f'This meet already exists as "{champ.name}" ({champ.date}, {champ.pool}) '
                f'with {db_result_count} results across {len(db_events)} events. '
                f'Importing again will skip duplicate results.'
            )
        elif same_date and same_pool and new_events:
            new_list = ', '.join(sorted(list(new_events))[:5])
            extra = '...' if len(new_events) > 5 else ''
            warning['type'] = 'partial_new'
            warning['message'] = (
                f'Meet "{champ.name}" ({champ.date}, {champ.pool}) already exists '
                f'with {db_result_count} results in {len(db_events)} events. '
                f'This file has {len(new_events)} new event(s) not yet imported: '
                f'{new_list}{extra}. '
                f'Importing will add the new events and skip existing duplicates.'
            )
        elif same_date and not same_pool:
            warning['type'] = 'different_pool'
            warning['message'] = (
                f'Meet "{champ.name}" ({champ.date}) exists with pool {champ.pool} '
                f'but this file is {meet_pool}. This may be a different session.'
            )
        else:
            warning['type'] = 'similar_name'
            warning['message'] = (
                f'A similarly named meet "{champ.name}" exists from {champ.date} '
                f'with {db_result_count} results. This file is for {meet_date or "unknown date"}. '
                f'If this is a different edition, you can proceed safely.'
            )

        warnings.append(warning)

    return warnings
