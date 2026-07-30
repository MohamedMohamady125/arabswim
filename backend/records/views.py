from rest_framework import viewsets, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Min, F
from .models import Record
from .serializers import RecordSerializer, RecordCreateSerializer


class RecordViewSet(viewsets.ModelViewSet):
    queryset = Record.objects.select_related('swimmer', 'swimmer__nationality', 'event')
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['swimmer__name']
    ordering_fields = ['result_date', 'time_centiseconds']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RecordCreateSerializer
        return RecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        record_type = self.request.query_params.get('record_type')
        event = self.request.query_params.get('event')
        swimmer = self.request.query_params.get('swimmer')
        is_new = self.request.query_params.get('is_new')
        pool = self.request.query_params.get('pool')
        gender = self.request.query_params.get('gender')
        if record_type:
            qs = qs.filter(record_type=record_type)
        if pool:
            qs = qs.filter(pool=pool)
        if gender:
            qs = qs.filter(swimmer__sex=gender)
        if event:
            qs = qs.filter(event_id=event)
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if is_new is not None:
            qs = qs.filter(is_new=is_new.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'])
    def new(self, request):
        records = self.get_queryset().filter(is_new=True)
        page = self.paginate_queryset(records)
        if page is not None:
            serializer = RecordSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = RecordSerializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def held(self, request):
        """All computed records held by one swimmer, across every scope
        (national/gcc/arab), pool (LCM/SCM) and age group (U10..U18, OPEN).

        Query params:
          swimmer – swimmer id (required)

        Records that are identical across several age groups (same swim) are
        merged into one entry with a `categories` list.
        """
        from championships.models import Result
        from swimmers.models import Swimmer

        swimmer_id = request.query_params.get('swimmer')
        try:
            swimmer = Swimmer.objects.select_related('nationality').get(id=int(swimmer_id))
        except (Swimmer.DoesNotExist, TypeError, ValueError):
            return Response([])

        region = swimmer.nationality.region if swimmer.nationality else None
        # U18 is the oldest age category shown anywhere on the site (no U19)
        age_groups = [f'U{n}' for n in range(10, 19)] + ['OPEN']

        held = []
        for pool in ('LCM', 'SCM'):
            rows = list(Result.objects.filter(
                championship__pool=pool,
                time_centiseconds__gt=0,
                is_hc=False,
                swimmer__sex=swimmer.sex,
                swimmer__nationality__region__in=['ARAB', 'GCC'],
            ).values(
                'event_id', 'event__name', 'event__sort_order', 'event__distance',
                'swimmer_id', 'swimmer__nationality_id', 'swimmer__nationality__region',
                'age_at_competition', 'time_centiseconds',
                'championship__name', 'championship__date',
            ))
            if not rows:
                continue

            scopes = [('arab', [r for r in rows])]
            if region == 'GCC':
                scopes.append(('gcc', [r for r in rows if r['swimmer__nationality__region'] == 'GCC']))
            if swimmer.nationality_id:
                scopes.append(('national', [r for r in rows if r['swimmer__nationality_id'] == swimmer.nationality_id]))

            for scope, subset in scopes:
                for ag in age_groups:
                    if ag == 'OPEN':
                        pool_rows = subset
                    else:
                        max_age = int(ag[1:])
                        pool_rows = [r for r in subset
                                     if r['age_at_competition'] is not None and r['age_at_competition'] <= max_age]
                    best = {}
                    for r in pool_rows:
                        b = best.get(r['event_id'])
                        if b is None or (r['time_centiseconds'], r['championship__date']) < (b['time_centiseconds'], b['championship__date']):
                            best[r['event_id']] = r
                    for r in best.values():
                        if r['swimmer_id'] == swimmer.id:
                            held.append({'scope': scope, 'pool': pool, 'age_group': ag, 'row': r})

        # Merge identical records (same swim holding several age categories)
        merged = {}
        order = []
        for h in held:
            r = h['row']
            key = (h['scope'], h['pool'], r['event_id'], r['time_centiseconds'], r['championship__date'])
            if key not in merged:
                cs = r['time_centiseconds']
                minutes, seconds, centis = cs // 6000, (cs % 6000) // 100, cs % 100
                time_str = f'{minutes}:{seconds:02d}.{centis:02d}' if minutes else f'{seconds}.{centis:02d}'
                merged[key] = {
                    'scope': h['scope'], 'pool': h['pool'],
                    'event_id': r['event_id'], 'event_name': r['event__name'],
                    'event_sort_order': r['event__sort_order'], 'event_distance': r['event__distance'],
                    'time': time_str, 'time_centiseconds': cs,
                    'championship_name': r['championship__name'],
                    'date': r['championship__date'].isoformat() if r['championship__date'] else '',
                    'categories': [],
                }
                order.append(key)
            merged[key]['categories'].append(h['age_group'])

        results = [merged[k] for k in order]
        results.sort(key=lambda r: (r['scope'], r['pool'], r['event_sort_order'], r['event_distance']))
        return Response(results)

    @action(detail=False, methods=['get'])
    def gaps(self, request):
        """Gap between a swimmer's all-time best times and the current records
        for every scope (national/gcc/arab) and pool the swimmer has swum.

        Query params:
          swimmer – swimmer id (required)
        """
        from championships.models import Result
        from swimmers.models import Swimmer
        from django.db.models import Min

        swimmer_id = request.query_params.get('swimmer')
        try:
            swimmer = Swimmer.objects.select_related('nationality').get(id=int(swimmer_id))
        except (Swimmer.DoesNotExist, TypeError, ValueError):
            return Response([])

        region = swimmer.nationality.region if swimmer.nationality else None

        def fmt(cs):
            minutes, seconds, centis = cs // 6000, (cs % 6000) // 100, cs % 100
            return f'{minutes}:{seconds:02d}.{centis:02d}' if minutes else f'{seconds}.{centis:02d}'

        out = []
        for pool in ('LCM', 'SCM'):
            bests = (
                Result.objects.filter(
                    swimmer=swimmer, championship__pool=pool,
                    time_centiseconds__gt=0, event__is_relay=False,
                )
                .values('event_id', 'event__name', 'event__sort_order', 'event__distance')
                .annotate(best=Min('time_centiseconds'))
            )
            best_by_event = {b['event_id']: b for b in bests}
            if not best_by_event:
                continue

            rows = list(Result.objects.filter(
                championship__pool=pool,
                time_centiseconds__gt=0,
                is_hc=False,
                swimmer__sex=swimmer.sex,
                swimmer__nationality__region__in=['ARAB', 'GCC'],
                event_id__in=best_by_event.keys(),
            ).values(
                'event_id', 'swimmer_id', 'swimmer__name',
                'swimmer__nationality_id', 'swimmer__nationality__region',
                'time_centiseconds',
            ))

            scopes = [('arab', rows)]
            if region == 'GCC':
                scopes.append(('gcc', [r for r in rows if r['swimmer__nationality__region'] == 'GCC']))
            if swimmer.nationality_id:
                scopes.append(('national', [r for r in rows if r['swimmer__nationality_id'] == swimmer.nationality_id]))

            for scope, subset in scopes:
                best_rec = {}
                for r in subset:
                    b = best_rec.get(r['event_id'])
                    if b is None or r['time_centiseconds'] < b['time_centiseconds']:
                        best_rec[r['event_id']] = r
                for ev_id, rec in best_rec.items():
                    b = best_by_event[ev_id]
                    gap_cs = b['best'] - rec['time_centiseconds']
                    record_cs = rec['time_centiseconds']
                    out.append({
                        'scope': scope,
                        'pool': pool,
                        'event_id': ev_id,
                        'event_name': b['event__name'],
                        'event_sort_order': b['event__sort_order'],
                        'event_distance': b['event__distance'],
                        'swimmer_best_cs': b['best'],
                        'swimmer_best': fmt(b['best']),
                        'record_cs': record_cs,
                        'record_time': fmt(record_cs),
                        'record_holder': rec['swimmer__name'],
                        'gap_cs': gap_cs,
                        'gap_time': fmt(abs(gap_cs)),
                        'gap_pct': round((b['best'] / record_cs - 1) * 100, 2) if record_cs else 0,
                        'holds': rec['swimmer_id'] == swimmer.id,
                    })

        out.sort(key=lambda g: (g['scope'], g['pool'], g['gap_cs']))
        return Response(out)

    @action(detail=False, methods=['get'])
    def computed(self, request):
        """Return the fastest time per event+gender from existing Result data.

        Query params:
          scope           – national, arab, gcc (default: arab)
          country         – country id (required when scope=national)
          classification  – filter championships by Classification id
          sub_classification – filter by SubClassification id
          pool            – LCM or SCM (default: LCM)
          gender          – M or F (omit for both)
          age_group       – e.g. U10..U17, OPEN (default: OPEN)
        """
        from championships.models import Result, Championship
        from core.models import Event
        from swimmers.models import Swimmer

        pool = request.query_params.get('pool', 'LCM')
        classification = request.query_params.get('classification')
        sub_classification = request.query_params.get('sub_classification')
        gender = request.query_params.get('gender')
        scope = request.query_params.get('scope', 'arab')
        country = request.query_params.get('country')
        age_group = request.query_params.get('age_group')

        # Build base queryset: valid timed results from championships
        qs = Result.objects.filter(
            championship__pool=pool,
            time_centiseconds__gt=0,
            is_hc=False,
        ).exclude(
            swimmer__nationality__region='OTHER',
        ).select_related(
            'swimmer', 'swimmer__nationality', 'event', 'championship',
            'championship__country',
        )

        # Scope filter
        if scope == 'national':
            if country:
                qs = qs.filter(swimmer__nationality_id=country)
            else:
                return Response([])
        elif scope == 'gcc':
            if country:
                qs = qs.filter(swimmer__nationality_id=country)
            else:
                qs = qs.filter(swimmer__nationality__region='GCC')
        else:  # arab (default)
            if country:
                qs = qs.filter(swimmer__nationality_id=country)
            else:
                qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])

        if classification:
            qs = qs.filter(championship__classification_id=classification)
        if sub_classification:
            qs = qs.filter(championship__sub_classification_id=sub_classification)
        if gender:
            qs = qs.filter(swimmer__sex=gender)

        # Age group filter
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                qs = qs.filter(age_at_competition__lte=max_age)
            except (ValueError, AttributeError):
                pass

        # For each (event, gender): find the minimum time
        best_per_event = (
            qs.values('event_id', 'swimmer__sex')
            .annotate(best_time=Min('time_centiseconds'))
        )

        # Now fetch the actual result rows that match those bests
        records = []
        for entry in best_per_event:
            result = (
                qs.filter(
                    event_id=entry['event_id'],
                    swimmer__sex=entry['swimmer__sex'],
                    time_centiseconds=entry['best_time'],
                )
                .order_by('championship__date')
                .first()
            )
            if result:
                cs = result.time_centiseconds
                minutes = cs // 6000
                seconds = (cs % 6000) // 100
                centis = cs % 100
                if minutes:
                    time_str = f'{minutes}:{seconds:02d}.{centis:02d}'
                else:
                    time_str = f'{seconds}.{centis:02d}'

                records.append({
                    'event_id': result.event_id,
                    'event_name': result.event.name,
                    'event_distance': result.event.distance,
                    'event_sort_order': result.event.sort_order,
                    'is_relay': result.event.is_relay,
                    'gender': result.swimmer.sex,
                    'swimmer_name': result.swimmer.name,
                    'swimmer_id': result.swimmer_id,
                    'is_relay_team': result.swimmer.is_relay_team,
                    'nationality': result.swimmer.nationality.name if result.swimmer.nationality else '',
                    'nationality_code': result.swimmer.nationality.code if result.swimmer.nationality else '',
                    'nationality_flag': result.swimmer.nationality.flag_url if result.swimmer.nationality else '',
                    'time': time_str,
                    'time_centiseconds': result.time_centiseconds,
                    'fina_points': result.fina_points,
                    'championship_name': result.championship.name,
                    'championship_country': result.championship.country.name if result.championship.country else '',
                    'championship_country_code': result.championship.country.code if result.championship.country else '',
                    'championship_country_flag': result.championship.country.flag_url if result.championship.country else '',
                    'date': result.championship.date.isoformat(),
                })

        # Sort by event sort_order then distance
        records.sort(key=lambda r: (r['gender'], r['event_sort_order'], r['event_distance']))
        return Response(records)
