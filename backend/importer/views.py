import os
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.cache import cache

from .services import parse_file, match_swimmers_preview, confirm_import
from .matcher import find_potential_duplicates, merge_swimmers
from .models import ImportLog, ImportJob
from swimmers.models import Swimmer
from championships.models import Championship, Result


MAX_PDF_SIZE = 60 * 1024 * 1024  # per companion PDF


def _pdf_entries_cached(data):
    """(full_name, age, team) entries from one PDF's bytes, md5-cached."""
    import hashlib
    import tempfile
    from .egypt_names import extract_pdf_entries
    h = hashlib.md5()
    h.update(data)
    cache_key = f'pdfnames_{h.hexdigest()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return {tuple(e) for e in json.loads(cached)}
    with tempfile.NamedTemporaryFile(suffix='.pdf') as tmp:
        tmp.write(data)
        tmp.flush()
        pdf_entries = extract_pdf_entries(tmp.name)
    cache.set(cache_key, json.dumps([list(e) for e in pdf_entries]),
              timeout=21600)
    return pdf_entries


class FileUploadView(APIView):
    """
    Step 1: Upload a results file, parse it, and return a preview.
    POST /api/v1/import/upload/
    """
    parser_classes = [MultiPartParser, FormParser]

    MAX_PDF_SIZE = MAX_PDF_SIZE

    def _build_repair_index(self, pdf_files):
        """NameRepairIndex from the meet's companion PDFs (full names).

        Extraction is slow on big PDFs, and the same PDFs are typically
        re-sent with every Excel file of the meet — cache each PDF's
        entries by content hash.
        """
        from .egypt_names import NameRepairIndex
        entries = set()
        for pf in pdf_files:
            if not pf.name.lower().endswith('.pdf'):
                raise ValueError(f'"{pf.name}" is not a PDF file')
            if pf.size > self.MAX_PDF_SIZE:
                raise ValueError(f'"{pf.name}" is too large (max 60 MB)')
            entries |= _pdf_entries_cached(b''.join(pf.chunks()))
        return NameRepairIndex(entries)

    def post(self, request):
        file = request.FILES.get('file')
        from core.uploads import validate_import_file
        err = validate_import_file(file)
        if err:
            return Response({'error': err}, status=400)

        try:
            import uuid
            repair_index = None
            pdfs = request.FILES.getlist('name_pdfs')
            if pdfs:
                repair_index = self._build_repair_index(pdfs)
            result = parse_file(uploaded_file=file, repair_index=repair_index)

            # Multi-meet Excel: return a list of previews
            if isinstance(result, list):
                meets_data = []
                for preview in result:
                    import_id = str(uuid.uuid4())
                    cache.set(f'import_{import_id}', json.dumps(preview, default=str), timeout=21600)
                    ImportLog.objects.create(
                        file_name=file.name,
                        file_type=os.path.splitext(file.name)[1].lower().strip('.'),
                        source_format=preview['meet'].get('format', 'unknown'),
                        meet_name=preview['meet'].get('name', ''),
                        total_results=preview['stats']['total_results'],
                        status='pending',
                    )
                    meet_warnings = _check_meet_duplicates(preview)
                    meets_data.append({
                        'import_id': import_id,
                        'meet_warnings': meet_warnings,
                        **preview,
                    })
                return Response({'meets': meets_data})

            # Single meet (original behavior)
            preview = result
            import_id = str(uuid.uuid4())
            cache.set(f'import_{import_id}', json.dumps(preview, default=str), timeout=21600)

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


def _finish_import_log(preview, result):
    """Mark the pending ImportLog row completed with the run's counters."""
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


def _run_confirm_job(job_id, preview, swimmer_decisions, championship_id,
                     championship_details, import_id):
    """Background worker: run confirm_import and store the outcome.

    confirm_import is one big transaction, so progress written through the
    worker's own connection would stay invisible until commit — the
    progress callback only updates a shared dict, and a small monitor
    thread (with its own DB connection) persists it every 2 seconds.
    """
    import threading
    from django.db import close_old_connections
    close_old_connections()
    ImportJob.objects.filter(id=job_id).update(status='running')

    shared = {'text': 'Starting…'}
    stop = threading.Event()

    def monitor():
        from django.db import close_old_connections as _coc
        last = ''
        while not stop.wait(2):
            text = shared['text']
            if text != last:
                try:
                    ImportJob.objects.filter(id=job_id).update(progress=text)
                    last = text
                except Exception:
                    # e.g. SQLite lock in dev — progress is best-effort
                    pass
        _coc()

    mon = threading.Thread(target=monitor, daemon=True)
    mon.start()
    try:
        def cb(text):
            shared['text'] = text

        result = confirm_import(preview, swimmer_decisions, championship_id,
                                championship_details, progress_cb=cb)
        _finish_import_log(preview, result)
        cache.delete(f'import_{import_id}')
        ImportJob.objects.filter(id=job_id).update(
            status='done', progress='', result=result)
    except Exception as e:
        ImportJob.objects.filter(id=job_id).update(
            status='failed', progress='', error=str(e)[:2000])
    finally:
        stop.set()
        mon.join()
        close_old_connections()


class ConfirmImportView(APIView):
    """
    Step 3: Confirm the import with swimmer decisions.
    POST /api/v1/import/confirm/
    Body: {
        import_id: "...",
        championship_id: int (optional),
        background: true (optional) — run as a background job and return
            { job_id } immediately; poll GET /import/confirm/<job_id>/.
            Big meets (Egypt: 30k-80k results) exceed the request timeout
            when run synchronously.
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

        # Background mode: return a job id immediately, work in a thread
        # (same pattern as scrape jobs) so huge meets can't hit the
        # gunicorn/proxy request timeout.
        if request.data.get('background'):
            import threading
            job = ImportJob.objects.create(
                meet_name=(championship_details or {}).get('name')
                          or preview['meet'].get('name', '')[:255],
                status='pending',
            )
            threading.Thread(
                target=_run_confirm_job,
                args=(job.id, preview, swimmer_decisions, championship_id,
                      championship_details, import_id),
                daemon=True,
            ).start()
            return Response({'job_id': job.id, 'status': 'pending'})

        try:
            result = confirm_import(preview, swimmer_decisions, championship_id, championship_details)
            _finish_import_log(preview, result)

            # Clean up cache
            cache.delete(f'import_{import_id}')

            return Response(result)

        except Exception as e:
            return Response({'error': str(e)}, status=400)


class ImportJobStatusView(APIView):
    """Poll a background confirm-import job.
    GET /api/v1/import/confirm/<job_id>/
    """
    def get(self, request, job_id):
        try:
            job = ImportJob.objects.get(id=job_id)
        except ImportJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=404)
        return Response({
            'job_id': job.id,
            'meet_name': job.meet_name,
            'status': job.status,
            'progress': job.progress,
            'error': job.error,
            'result': job.result or None,
        })


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
                    'nationality': s1.nationality.name if s1.nationality else '',
                    'date_of_birth': str(s1.date_of_birth),
                },
                'swimmer2': {
                    'id': s2.id, 'name': s2.name,
                    'nationality': s2.nationality.name if s2.nationality else '',
                    'date_of_birth': str(s2.date_of_birth),
                },
                'similarity': score,
            })
        return Response(data)


class MergeSwimmersView(APIView):
    """
    Merge duplicate swimmers — one keeper, one or more removals.
    POST /api/v1/import/merge/
    Body: { keep_id: int, remove_id: int } or { keep_id: int, remove_ids: [int, ...] }
    """
    def post(self, request):
        keep_id = request.data.get('keep_id')
        remove_ids = request.data.get('remove_ids')
        if remove_ids is None:
            remove_id = request.data.get('remove_id')
            remove_ids = [remove_id] if remove_id else []

        if not keep_id or not remove_ids:
            return Response({'error': 'keep_id and remove_id(s) required'}, status=400)
        remove_ids = [int(r) for r in remove_ids]
        if int(keep_id) in remove_ids:
            return Response({'error': 'Cannot merge a swimmer into themselves'}, status=400)

        try:
            keep = Swimmer.objects.get(id=keep_id)
        except Swimmer.DoesNotExist:
            return Response({'error': 'Swimmer not found'}, status=404)

        merged_names = []
        for rid in remove_ids:
            try:
                remove = Swimmer.objects.get(id=rid)
            except Swimmer.DoesNotExist:
                return Response({'error': f'Swimmer {rid} not found', 'merged': merged_names}, status=404)
            merged_names.append(remove.name)
            merge_swimmers(keep, remove)

        names = ', '.join(f'"{n}"' for n in merged_names)
        return Response({
            'message': f'Merged {names} into "{keep.name}"',
            'swimmer_id': keep.id,
            'merged_count': len(merged_names),
        })


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


def repair_scraped_rows(rows, repair_index):
    """Replace truncated names in scraped rows with full heats-PDF names."""
    from .egypt_names import is_truncated_length
    stats = {'checked': 0, 'repaired': 0, 'ambiguous': 0, 'no_match': 0}
    memo = {}
    for row in rows:
        if 'relay' in str(row.get('Stroke', '')).lower():
            continue
        name = row.get('Name') or ''
        if not is_truncated_length(name):
            continue
        stats['checked'] += 1
        try:
            age = int(row.get('Age') or 0) or None
        except (TypeError, ValueError):
            age = None
        key = (name, age, row.get('Team') or '')
        if key not in memo:
            memo[key] = repair_index.repair(name, age=age, team=key[2])
        full, why = memo[key]
        if full:
            row['Name'] = full
            stats['repaired'] += 1
        else:
            stats[why] += 1
    return stats


def _run_scrape_job(job_id, pdf_paths=None):
    """Background worker: scrape the site and store clean rows on the job."""
    from django.db import close_old_connections
    from .models import ScrapeJob
    from .scraper import scrape_meet
    close_old_connections()
    job = ScrapeJob.objects.get(id=job_id)
    job.status = 'running'
    job.save(update_fields=['status'])
    try:
        def progress(done, total):
            if done == 1 or done == total or done % 10 == 0:
                ScrapeJob.objects.filter(id=job_id).update(
                    progress=f'{done} / {total} event pages')

        meet_name, date_text, rows = scrape_meet(job.url, progress_cb=progress)
        name_stats = {}
        if rows and pdf_paths:
            from .egypt_names import NameRepairIndex
            ScrapeJob.objects.filter(id=job_id).update(
                progress='Reading heats PDFs for full names…')
            entries = set()
            for p in pdf_paths:
                with open(p, 'rb') as f:
                    entries |= _pdf_entries_cached(f.read())
            index = NameRepairIndex(entries)
            if len(index):
                name_stats = repair_scraped_rows(rows, index)
        job.meet_name = meet_name[:255]
        job.date_text = date_text[:100]
        job.rows = rows
        job.name_stats = name_stats
        job.total_results = len(rows)
        job.total_events = len({r['Event #'] for r in rows})
        job.status = 'done' if rows else 'failed'
        if not rows:
            job.error = 'No results found on that page'
        job.progress = ''
        job.save()
    except Exception as e:
        ScrapeJob.objects.filter(id=job_id).update(
            status='failed', error=str(e)[:2000], progress='')
    finally:
        if pdf_paths:
            for p in pdf_paths:
                try:
                    os.remove(p)
                except OSError:
                    pass
        close_old_connections()


class ScrapeView(APIView):
    """
    Scrape a federation Hy-Tek HTML results site into a clean Excel file.
    GET  /api/v1/import/scrape/          — list scrape jobs
    POST /api/v1/import/scrape/ {url}    — start a new scrape (async);
         optional ``name_pdfs`` files (heats PDFs) restore full names
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        from .models import ScrapeJob
        jobs = ScrapeJob.objects.all()[:30]
        return Response([{
            'id': j.id,
            'url': j.url,
            'meet_name': j.meet_name,
            'date_text': j.date_text,
            'status': j.status,
            'progress': j.progress,
            'error': j.error,
            'total_events': j.total_events,
            'total_results': j.total_results,
            'name_stats': j.name_stats,
            'created_at': j.created_at,
        } for j in jobs])

    def post(self, request):
        import tempfile
        import threading
        from .models import ScrapeJob
        url = (request.data.get('url') or '').strip()
        if not url.lower().startswith(('http://', 'https://')):
            return Response({'error': 'Please paste a valid http(s) link'},
                            status=400)
        # Optional heats PDFs → persist to temp files for the worker thread
        pdf_paths = []
        for pf in request.FILES.getlist('name_pdfs'):
            if not pf.name.lower().endswith('.pdf'):
                for p in pdf_paths:
                    os.remove(p)
                return Response(
                    {'error': f'"{pf.name}" is not a PDF file'}, status=400)
            if pf.size > MAX_PDF_SIZE:
                for p in pdf_paths:
                    os.remove(p)
                return Response(
                    {'error': f'"{pf.name}" is too large (max 60 MB)'},
                    status=400)
            tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
            for chunk in pf.chunks():
                tmp.write(chunk)
            tmp.close()
            pdf_paths.append(tmp.name)
        job = ScrapeJob.objects.create(url=url)
        threading.Thread(target=_run_scrape_job, args=(job.id, pdf_paths),
                         daemon=True).start()
        return Response({'id': job.id, 'status': 'pending'}, status=201)


class ScrapeDownloadView(APIView):
    """GET /api/v1/import/scrape/{id}/download/ — the scraped data as .xlsx"""

    def get(self, request, job_id):
        import io
        import re as _re
        import pandas as pd
        from django.http import HttpResponse
        from .models import ScrapeJob
        from .scraper import EXCEL_COLUMNS
        try:
            job = ScrapeJob.objects.get(id=job_id)
        except ScrapeJob.DoesNotExist:
            return Response({'error': 'Scrape not found'}, status=404)
        if job.status != 'done' or not job.rows:
            return Response({'error': 'Scrape has no data yet'}, status=400)
        df = pd.DataFrame(job.rows, columns=EXCEL_COLUMNS)
        buf = io.BytesIO()
        df.to_excel(buf, index=False, sheet_name='Results')
        buf.seek(0)
        slug = _re.sub(r'[^A-Za-z0-9]+', '_',
                       job.meet_name or 'meet').strip('_').lower() or 'meet'
        resp = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.'
                         'spreadsheetml.sheet')
        resp['Content-Disposition'] = f'attachment; filename="{slug}_results.xlsx"'
        return resp
