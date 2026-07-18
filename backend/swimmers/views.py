from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from .models import Swimmer
from .serializers import SwimmerListSerializer, SwimmerDetailSerializer, SwimmerCreateUpdateSerializer


class SwimmerPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 10000


class SwimmerViewSet(viewsets.ModelViewSet):
    queryset = Swimmer.objects.select_related('nationality').prefetch_related('nicknames')
    pagination_class = SwimmerPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'date_of_birth', 'created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SwimmerListSerializer
        if self.action == 'retrieve':
            return SwimmerDetailSerializer
        return SwimmerCreateUpdateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list':
            # Non-Arab swimmers hold meet results but get no profile in
            # the Swimmers section; relay-team placeholders are not athletes
            qs = qs.exclude(nationality__region='OTHER').exclude(is_relay_team=True)
        nationality = self.request.query_params.get('nationality')
        sex = self.request.query_params.get('sex')
        if nationality:
            qs = qs.filter(nationality_id=nationality)
        if sex:
            qs = qs.filter(sex=sex)
        return qs

    @action(detail=False, methods=['get'])
    def search(self, request):
        q = request.query_params.get('q', '')
        swimmers = Swimmer.objects.filter(name__icontains=q).exclude(
            nationality__region='OTHER').exclude(is_relay_team=True)[:20]
        serializer = SwimmerListSerializer(swimmers, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def birthdays(self, request):
        month = request.query_params.get('month')
        if not month:
            return Response({'error': 'month parameter required'}, status=400)
        swimmers = Swimmer.objects.filter(
            date_of_birth__isnull=False,
            date_of_birth__month=int(month)
        ).exclude(is_relay_team=True).select_related('nationality')
        data = []
        for s in swimmers:
            data.append({
                'id': s.id,
                'name': s.name,
                'date_of_birth': s.date_of_birth,
                'day': s.date_of_birth.day,
                'age': s.age,
                'nationality': s.nationality.name,
                'photo': s.photo.url if s.photo else None,
            })
        return Response(data)

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """Get all events this swimmer has competed in, with result counts.
        Also includes relay events where this swimmer appears in relay_swimmers."""
        swimmer = self.get_object()
        from championships.models import Result
        from django.db.models import Count, Min, Q
        from importer.parsers.base import format_centiseconds

        # Individual events, split per pool (SCM and LCM times are not
        # comparable, so each gets its own entry and best time)
        events = Result.objects.filter(swimmer=swimmer).values(
            'event__id', 'event__name', 'event__distance', 'event__stroke',
            'championship__pool',
        ).annotate(
            times_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('event__sort_order', 'event__distance', '-championship__pool')

        data = []
        seen_keys = set()
        for e in events:
            pool = e['championship__pool'] or ''
            seen_keys.add((e['event__id'], pool))
            data.append({
                'event_id': e['event__id'],
                'event_name': e['event__name'],
                'distance': e['event__distance'],
                'stroke': e['event__stroke'],
                'pool': pool,
                'times_count': e['times_count'],
                'best_time': format_centiseconds(e['best_time']),
                'best_time_centiseconds': e['best_time'],
                'is_relay': False,
            })

        # Relay events where this swimmer appears in relay_swimmers JSON.
        # Prefilter in the DB with a text match on the JSON column, then
        # verify the exact name in Python (works on Postgres and sqlite).
        from django.db.models import TextField
        from django.db.models.functions import Cast
        relay_results = Result.objects.filter(
            relay_swimmers__isnull=False,
            event__is_relay=True,
        ).annotate(
            relay_swimmers_text=Cast('relay_swimmers', TextField()),
        ).filter(
            relay_swimmers_text__icontains=swimmer.name,
        ).select_related('event', 'championship')

        matched_relays = {}
        for r in relay_results:
            if not r.relay_swimmers:
                continue
            for s in r.relay_swimmers:
                name = s.get('name', '') if isinstance(s, dict) else (s if isinstance(s, str) else '')
                if name.upper() == swimmer.name.upper():
                    key = (r.event_id, r.championship.pool or '')
                    if key not in matched_relays:
                        matched_relays[key] = {'results': [], 'event': r.event}
                    matched_relays[key]['results'].append(r)
                    break

        for (eid, pool), info in matched_relays.items():
            if (eid, pool) in seen_keys:
                continue
            ev = info['event']
            best_cs = min(r.time_centiseconds for r in info['results'])
            data.append({
                'event_id': ev.id,
                'event_name': ev.name,
                'distance': ev.distance,
                'stroke': ev.stroke,
                'pool': pool,
                'times_count': len(info['results']),
                'best_time': format_centiseconds(best_cs),
                'best_time_centiseconds': best_cs,
                'is_relay': True,
            })

        return Response(data)

    @action(detail=True, methods=['get'], url_path='events/(?P<event_id>[^/.]+)/history')
    def event_history(self, request, pk=None, event_id=None):
        """Get all times for a swimmer in a specific event.
        For relay events, finds results where swimmer appears in relay_swimmers."""
        swimmer = self.get_object()
        from championships.models import Result
        from core.models import Event
        from importer.parsers.base import format_centiseconds

        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({'error': 'Event not found'}, status=404)
        data = []
        pool = request.query_params.get('pool')

        if event.is_relay:
            # Search relay results for this swimmer's name
            relay_results = Result.objects.filter(
                event_id=event_id,
                relay_swimmers__isnull=False,
            ).select_related('championship', 'championship__country', 'event').order_by('championship__date')
            if pool:
                relay_results = relay_results.filter(championship__pool=pool)

            for r in relay_results:
                if not r.relay_swimmers:
                    continue
                # Find this swimmer in the relay
                swimmer_split = None
                found = False
                for s in r.relay_swimmers:
                    if isinstance(s, dict):
                        if s.get('name', '').upper() == swimmer.name.upper():
                            swimmer_split = s.get('split_time', '')
                            found = True
                            break
                    elif isinstance(s, str) and s.upper() == swimmer.name.upper():
                        found = True
                        break

                if not found:
                    continue

                data.append({
                    'id': r.id,
                    'time': format_centiseconds(r.time_centiseconds),
                    'time_centiseconds': r.time_centiseconds,
                    'split_time': swimmer_split or '',
                    'round_type': r.round_type,
                    'fina_points': r.fina_points,
                    'team': r.swimmer.name,  # Team/club name
                    'is_relay': True,
                    'relay_swimmers': r.relay_swimmers,
                    'championship_id': r.championship.id,
                    'championship_name': r.championship.name,
                    'championship_date': r.championship.date,
                    'championship_location': r.championship.location,
                    'championship_country': r.championship.country.name if r.championship.country else '',
                    'pool': r.championship.pool,
                    'age_at_competition': r.age_at_competition,
                })
        else:
            # Individual event
            results = Result.objects.filter(
                swimmer=swimmer, event_id=event_id
            ).select_related('championship', 'championship__country', 'event').order_by('championship__date')
            if pool:
                results = results.filter(championship__pool=pool)

            for r in results:
                data.append({
                    'id': r.id,
                    'time': format_centiseconds(r.time_centiseconds),
                    'time_centiseconds': r.time_centiseconds,
                    'round_type': r.round_type,
                    'fina_points': r.fina_points,
                    'team': r.team,
                    'is_relay': False,
                    'championship_id': r.championship.id,
                    'championship_name': r.championship.name,
                    'championship_date': r.championship.date,
                    'championship_location': r.championship.location,
                    'championship_country': r.championship.country.name if r.championship.country else '',
                    'pool': r.championship.pool,
                    'age_at_competition': r.age_at_competition,
                })
        return Response(data)

    @action(detail=True, methods=['get'], url_path='profile-stats')
    def profile_stats(self, request, pk=None):
        """Aggregated career stats for the swimmer profile page."""
        swimmer = self.get_object()
        from championships.models import Result, Championship
        from medals.models import Medal
        from records.models import Record
        from django.db.models import Count, Max, Q, Min
        from importer.parsers.base import format_centiseconds

        # Championships history
        champ_ids = Result.objects.filter(swimmer=swimmer).values_list(
            'championship_id', flat=True).distinct()
        championships = Championship.objects.filter(id__in=champ_ids).select_related(
            'country', 'classification_category').order_by('-date')
        champs_data = [{
            'id': c.id, 'name': c.name, 'date': c.date,
            'pool': c.pool,
            'country': c.country.name if c.country else '',
            'country_code': c.country.code if c.country else '',
            'flag_url': c.country.flag_url if c.country else '',
            'category': c.classification_category.name if c.classification_category else '',
        } for c in championships]

        # Medal summary
        medals_qs = Medal.objects.filter(swimmer=swimmer)
        medal_counts = medals_qs.aggregate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        )

        # Medals by classification category (for the stacked bar chart)
        medals_by_level = list(
            medals_qs.values('championship__classification_category__name')
            .annotate(
                gold=Count('id', filter=Q(medal_type='GOLD')),
                silver=Count('id', filter=Q(medal_type='SILVER')),
                bronze=Count('id', filter=Q(medal_type='BRONZE')),
            )
            .order_by('championship__classification_category__name')
        )
        for m in medals_by_level:
            m['category'] = m.pop('championship__classification_category__name') or 'Uncategorized'

        # Medals grouped by classification hierarchy
        all_medals = list(
            medals_qs.select_related(
                'event', 'championship',
                'championship__classification_category',
                'championship__classification',
                'championship__sub_classification',
            ).order_by('-championship__date')
        )
        # Build tree: category → classification → sub_classification → medals
        from collections import OrderedDict
        medals_tree = OrderedDict()
        for m in all_medals:
            c = m.championship
            cat_name = c.classification_category.name if c.classification_category else 'Uncategorized'
            cls_name = c.classification.name if c.classification else 'General'
            sub_name = c.sub_classification.name if c.sub_classification else None

            if cat_name not in medals_tree:
                medals_tree[cat_name] = {'gold': 0, 'silver': 0, 'bronze': 0, 'classifications': OrderedDict()}
            cat = medals_tree[cat_name]
            cat[{'GOLD': 'gold', 'SILVER': 'silver', 'BRONZE': 'bronze'}[m.medal_type]] += 1

            if cls_name not in cat['classifications']:
                cat['classifications'][cls_name] = {'gold': 0, 'silver': 0, 'bronze': 0, 'sub_classifications': OrderedDict(), 'medals': []}
            cls = cat['classifications'][cls_name]
            cls[{'GOLD': 'gold', 'SILVER': 'silver', 'BRONZE': 'bronze'}[m.medal_type]] += 1

            medal_data = {
                'id': m.id, 'medal_type': m.medal_type,
                'event_name': m.event.name,
                'championship_name': c.name,
                'championship_id': c.id,
                'championship_date': c.date,
            }

            if sub_name:
                if sub_name not in cls['sub_classifications']:
                    cls['sub_classifications'][sub_name] = {'gold': 0, 'silver': 0, 'bronze': 0, 'medals': []}
                sub = cls['sub_classifications'][sub_name]
                sub[{'GOLD': 'gold', 'SILVER': 'silver', 'BRONZE': 'bronze'}[m.medal_type]] += 1
                sub['medals'].append(medal_data)
            else:
                cls['medals'].append(medal_data)

        # Serialize the tree
        medals_hierarchy = []
        for cat_name, cat_data in medals_tree.items():
            cat_entry = {
                'name': cat_name, 'gold': cat_data['gold'], 'silver': cat_data['silver'], 'bronze': cat_data['bronze'],
                'classifications': [],
            }
            for cls_name, cls_data in cat_data['classifications'].items():
                cls_entry = {
                    'name': cls_name, 'gold': cls_data['gold'], 'silver': cls_data['silver'], 'bronze': cls_data['bronze'],
                    'medals': cls_data['medals'],
                    'sub_classifications': [],
                }
                for sub_name, sub_data in cls_data['sub_classifications'].items():
                    cls_entry['sub_classifications'].append({
                        'name': sub_name, 'gold': sub_data['gold'], 'silver': sub_data['silver'], 'bronze': sub_data['bronze'],
                        'medals': sub_data['medals'],
                    })
                cat_entry['classifications'].append(cls_entry)
            medals_hierarchy.append(cat_entry)

        # Best FINA points
        best_fina_result = Result.objects.filter(
            swimmer=swimmer, fina_points__isnull=False
        ).select_related('event', 'championship').order_by('-fina_points').first()
        best_fina = None
        if best_fina_result:
            best_fina = {
                'points': best_fina_result.fina_points,
                'event_name': best_fina_result.event.name,
                'championship_name': best_fina_result.championship.name,
                'championship_id': best_fina_result.championship.id,
            }

        # Records held
        records = [{
            'id': r.id,
            'record_type': r.record_type,
            'event_name': r.event.name,
            'time': r.formatted_time,
            'time_centiseconds': r.time_centiseconds,
            'location': r.location,
            'date': r.result_date,
        } for r in Record.objects.filter(swimmer=swimmer).select_related('event')]

        # Best event (highest FINA across events)
        best_event_agg = (
            Result.objects.filter(swimmer=swimmer, fina_points__isnull=False)
            .values('event__name')
            .annotate(best_fina=Max('fina_points'))
            .order_by('-best_fina')
            .first()
        )

        # FINA points distribution — count of results at each tier
        fina_results = list(
            Result.objects.filter(swimmer=swimmer, fina_points__isnull=False)
            .values_list('fina_points', flat=True)
        )
        fina_distribution = []
        for threshold in [900, 800, 700, 600, 500, 400]:
            count = sum(1 for p in fina_results if p >= threshold)
            if count > 0 or fina_distribution:
                fina_distribution.append({'threshold': threshold, 'count': count})
        # Only include tiers that the swimmer has actually reached
        # (trim trailing zero tiers at the bottom)
        while fina_distribution and fina_distribution[-1]['count'] == 0:
            fina_distribution.pop()

        return Response({
            'total_championships': len(champs_data),
            'championships': champs_data,
            'medals': medal_counts,
            'medals_by_level': medals_by_level,
            'medals_hierarchy': medals_hierarchy,
            'best_fina': best_fina,
            'best_event': best_event_agg['event__name'] if best_event_agg else None,
            'records': records,
            'total_records': len(records),
            'fina_distribution': fina_distribution,
        })

    @action(detail=False, methods=['get'])
    def compare(self, request):
        """Compare up to 5 swimmers side-by-side."""
        ids = request.query_params.get('ids', '')
        id_list = [i.strip() for i in ids.split(',') if i.strip()][:5]
        if len(id_list) < 2:
            return Response({'error': 'At least 2 swimmer IDs required'}, status=400)

        from championships.models import Result
        from medals.models import Medal
        from records.models import Record
        from django.db.models import Count, Max, Min, Q, Avg
        from importer.parsers.base import format_centiseconds

        swimmers = Swimmer.objects.filter(id__in=id_list).select_related('nationality')
        swimmer_map = {s.id: s for s in swimmers}

        # Collect all events across these swimmers
        all_events_raw = (
            Result.objects.filter(swimmer_id__in=id_list, swimmer__is_relay_team=False)
            .values('event__id', 'event__name', 'event__sort_order', 'event__distance', 'event__is_relay', 'championship__pool')
            .distinct()
        )
        # Build event keys that at least 2 swimmers share
        event_swimmers = {}
        for row in Result.objects.filter(swimmer_id__in=id_list, swimmer__is_relay_team=False).values('event_id', 'championship__pool', 'swimmer_id').distinct():
            key = (row['event_id'], row['championship__pool'] or '')
            event_swimmers.setdefault(key, set()).add(row['swimmer_id'])

        data = []
        for sid in id_list:
            s = swimmer_map.get(int(sid))
            if not s:
                continue

            results_qs = Result.objects.filter(swimmer=s, swimmer__is_relay_team=False)

            # Aggregates
            agg = results_qs.aggregate(
                total_swims=Count('id'),
                total_championships=Count('championship_id', distinct=True),
                best_fina=Max('fina_points'),
                avg_fina=Avg('fina_points'),
            )

            # Medal counts
            medal_agg = Medal.objects.filter(swimmer=s).aggregate(
                gold=Count('id', filter=Q(medal_type='GOLD')),
                silver=Count('id', filter=Q(medal_type='SILVER')),
                bronze=Count('id', filter=Q(medal_type='BRONZE')),
                total=Count('id'),
            )

            # Records count
            records_count = Record.objects.filter(swimmer=s).count()

            # Personal bests per event+pool
            pbs = {}
            for row in results_qs.values('event_id', 'event__name', 'championship__pool').annotate(
                best=Min('time_centiseconds'), count=Count('id')
            ).order_by('event__sort_order', 'event__distance'):
                pool = row['championship__pool'] or ''
                key = (row['event_id'], pool)
                pbs[key] = {
                    'event_name': row['event__name'],
                    'pool': pool,
                    'best_time': format_centiseconds(row['best']),
                    'best_cs': row['best'],
                    'swims': row['count'],
                }

            data.append({
                'id': s.id,
                'name': s.name,
                'photo': s.photo.url if s.photo else None,
                'nationality': s.nationality.name if s.nationality else '',
                'nationality_code': s.nationality.code if s.nationality else '',
                'flag_url': s.nationality.flag_url if s.nationality else '',
                'sex': s.sex,
                'age': s.age,
                'club': s.club,
                'total_swims': agg['total_swims'],
                'total_championships': agg['total_championships'],
                'best_fina': agg['best_fina'],
                'avg_fina': round(agg['avg_fina']) if agg['avg_fina'] else None,
                'medals': medal_agg,
                'records_count': records_count,
                'personal_bests': pbs,
            })

        # Find shared events (events where at least 2 of the compared swimmers have results)
        shared_events = []
        seen = set()
        for (eid, pool), sids in sorted(event_swimmers.items(), key=lambda x: len(x[1]), reverse=True):
            if len(sids) >= 2 and (eid, pool) not in seen:
                seen.add((eid, pool))
                # Get event name from any swimmer's pbs
                event_name = None
                for d in data:
                    pb = d['personal_bests'].get((eid, pool))
                    if pb:
                        event_name = pb['event_name']
                        break
                if event_name:
                    shared_events.append({'event_id': eid, 'pool': pool, 'event_name': event_name})

        # Serialize pbs as dict with string keys for JSON
        for d in data:
            d['personal_bests'] = {f"{k[0]}_{k[1]}": v for k, v in d['personal_bests'].items()}

        return Response({
            'swimmers': data,
            'shared_events': shared_events,
        })

    @action(detail=True, methods=['post'])
    def upload_photo(self, request, pk=None):
        swimmer = self.get_object()
        photo = request.FILES.get('photo')
        from core.uploads import validate_image
        err = validate_image(photo)
        if err:
            return Response({'error': err}, status=400)
        swimmer.photo = photo
        swimmer.save()
        return Response({'photo': swimmer.photo.url})
