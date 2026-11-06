from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from championships.models import Result
from records.models import IntermediateTime
from django.db.models import Min, Q


def _fmt_cs(cs):
    hours = cs // 360000
    minutes = (cs % 360000) // 6000
    seconds = (cs % 6000) // 100
    centis = cs % 100
    if hours:
        return f'{hours}:{minutes:02d}:{seconds:02d}.{centis:02d}'
    if minutes:
        return f'{minutes}:{seconds:02d}.{centis:02d}'
    return f'{seconds}.{centis:02d}'


class RankingPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'limit'
    max_page_size = 100


class RankingView(APIView):
    def get(self, request):
        def _int(name):
            raw = request.query_params.get(name)
            try:
                return int(raw) if raw else None
            except (TypeError, ValueError):
                return None  # ignore malformed numeric params instead of 500ing

        scope = request.query_params.get('scope', 'arab')
        country = _int('country')
        gender = request.query_params.get('gender')
        year = _int('year')
        pool = request.query_params.get('pool')
        event = _int('event')
        age_group = request.query_params.get('age_group')
        championship = _int('championship')
        classification = _int('classification')
        sub_classification = _int('sub_classification')

        # Event is required for rankings to make sense
        if not event:
            return Response({
                'count': 0,
                'next': None,
                'previous': None,
                'results': [],
            })

        qs = Result.objects.select_related(
            'swimmer', 'swimmer__nationality', 'nationality', 'championship', 'championship__country', 'event'
        ).filter(event_id=event, is_hc=False, time_centiseconds__gt=0).exclude(nationality__region='OTHER')

        # Filter by scope
        if scope == 'national' and country:
            qs = qs.filter(nationality_id=country)
        elif scope == 'arab':
            qs = qs.filter(nationality__region__in=['ARAB', 'GCC'])
        elif scope == 'gcc':
            qs = qs.filter(nationality__region='GCC')

        if gender:
            qs = qs.filter(swimmer__sex=gender)
        if year:
            qs = qs.filter(championship__date__year=year)
        if pool:
            qs = qs.filter(championship__pool=pool)
        if championship:
            qs = qs.filter(championship_id=championship)
        if classification:
            qs = qs.filter(championship__classification_id=classification)
        if sub_classification:
            qs = qs.filter(championship__sub_classification_id=sub_classification)

        # Age group filter
        # OPEN = best times regardless of age (no filter)
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                qs = qs.filter(
                    age_at_competition__lte=max_age,
                )
            except (ValueError, AttributeError):
                pass

        # Lead-in splits count too (same rule as records: the opening 50 of a
        # 100 can rank in the 50). Mirror every Result filter via result__.
        it_qs = (IntermediateTime.objects
                 .filter(event_id=event, time_centiseconds__gt=0,
                         result__is_hc=False)
                 .exclude(result__nationality__region='OTHER'))
        if scope == 'national' and country:
            it_qs = it_qs.filter(result__nationality_id=country)
        elif scope == 'arab':
            it_qs = it_qs.filter(result__nationality__region__in=['ARAB', 'GCC'])
        elif scope == 'gcc':
            it_qs = it_qs.filter(result__nationality__region='GCC')
        if gender:
            it_qs = it_qs.filter(result__swimmer__sex=gender)
        if year:
            it_qs = it_qs.filter(result__championship__date__year=year)
        if pool:
            it_qs = it_qs.filter(result__championship__pool=pool)
        if championship:
            it_qs = it_qs.filter(result__championship_id=championship)
        if classification:
            it_qs = it_qs.filter(result__championship__classification_id=classification)
        if sub_classification:
            it_qs = it_qs.filter(result__championship__sub_classification_id=sub_classification)
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                it_qs = it_qs.filter(result__age_at_competition__lte=max_age)
            except (ValueError, AttributeError):
                pass

        # Best time per swimmer from full swims and from lead-in splits,
        # merged: a real swim wins ties, a faster split outranks it.
        res_best = dict(qs.values('swimmer_id')
                        .annotate(best=Min('time_centiseconds'))
                        .values_list('swimmer_id', 'best'))
        it_best = dict(it_qs.values('result__swimmer_id')
                       .annotate(best=Min('time_centiseconds'))
                       .values_list('result__swimmer_id', 'best'))
        merged = []
        for sid, t in res_best.items():
            st = it_best.get(sid)
            if st is not None and st < t:
                merged.append({'swimmer_id': sid, 'best_time': st, 'from_split': True})
            else:
                merged.append({'swimmer_id': sid, 'best_time': t, 'from_split': False})
        for sid, st in it_best.items():
            if sid not in res_best:
                merged.append({'swimmer_id': sid, 'best_time': st, 'from_split': True})
        merged.sort(key=lambda r: (r['best_time'], r['swimmer_id']))

        paginator = RankingPagination()
        page = paginator.paginate_queryset(merged, request)
        page_rows = page if page is not None else merged

        # Fetch only this page's backing rows
        res_rows = [r for r in page_rows if not r['from_split']]
        split_rows = [r for r in page_rows if r['from_split']]
        row_filter = Q(pk__in=[])
        for row in res_rows:
            row_filter |= Q(swimmer_id=row['swimmer_id'],
                            time_centiseconds=row['best_time'])
        by_swimmer = {}
        if res_rows:
            for r in qs.filter(row_filter):
                by_swimmer.setdefault(r.swimmer_id, r)
        split_filter = Q(pk__in=[])
        for row in split_rows:
            split_filter |= Q(result__swimmer_id=row['swimmer_id'],
                              time_centiseconds=row['best_time'])
        split_by_swimmer = {}
        if split_rows:
            fetched_its = (it_qs.filter(split_filter)
                           .select_related('result', 'result__swimmer',
                                           'result__swimmer__nationality',
                                           'result__nationality', 'result__event',
                                           'result__championship',
                                           'result__championship__country'))
            for it in fetched_its:
                split_by_swimmer.setdefault(it.result.swimmer_id, it)

        data = []
        start_rank = (paginator.page.number - 1) * paginator.page_size + 1 if page else 1
        for row in page_rows:
            if row['from_split']:
                it = split_by_swimmer.get(row['swimmer_id'])
                if it is None:
                    continue
                result, time_cs, fina = it.result, it.time_centiseconds, None
                extra = {'from_split': True, 'source_event_name': result.event.name}
            else:
                result = by_swimmer.get(row['swimmer_id'])
                if result is None:
                    continue
                time_cs, fina, extra = result.time_centiseconds, result.fina_points, {}
            data.append({
                'rank': start_rank + len(data),
                # deep link target: the exact swim behind this ranking entry
                'result_id': result.id,
                'championship_id': result.championship_id,
                'swimmer_id': result.swimmer.id,
                'swimmer_name': result.swimmer.name,
                'nationality': (result.nationality or result.swimmer.nationality).name if (result.nationality or result.swimmer.nationality) else '',
                'nationality_code': (result.nationality or result.swimmer.nationality).code if (result.nationality or result.swimmer.nationality) else '',
                'nationality_flag': (result.nationality or result.swimmer.nationality).flag_url if (result.nationality or result.swimmer.nationality) else '',
                'age_at_competition': result.age_at_competition,
                'time': _fmt_cs(time_cs),
                'time_centiseconds': time_cs,
                'championship_name': result.championship.name,
                'championship_location': result.championship.location,
                'championship_country': result.championship.country.name if result.championship.country else '',
                'championship_country_code': result.championship.country.code if result.championship.country else '',
                'championship_country_flag': result.championship.country.flag_url if result.championship.country else '',
                'fina_points': fina,
                'date': str(result.championship.date),
                **extra,
            })

        if page is not None:
            return paginator.get_paginated_response(data)
        return Response(data)
