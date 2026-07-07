from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from championships.models import Result
from django.db.models import Min


class RankingPagination(PageNumberPagination):
    page_size = 50


class RankingView(APIView):
    def get(self, request):
        scope = request.query_params.get('scope', 'arab')
        country = request.query_params.get('country')
        gender = request.query_params.get('gender')
        year = request.query_params.get('year')
        pool = request.query_params.get('pool')
        event = request.query_params.get('event')
        age_group = request.query_params.get('age_group')

        # Event is required for rankings to make sense
        if not event:
            return Response({
                'count': 0,
                'next': None,
                'previous': None,
                'results': [],
            })

        qs = Result.objects.select_related(
            'swimmer', 'swimmer__nationality', 'championship', 'championship__country', 'event'
        ).filter(event_id=event).exclude(swimmer__nationality__region='OTHER')

        # Filter by scope
        if scope == 'national' and country:
            qs = qs.filter(swimmer__nationality_id=country)
        elif scope == 'arab':
            qs = qs.filter(swimmer__nationality__region__in=['ARAB', 'GCC'])
        elif scope == 'gcc':
            qs = qs.filter(swimmer__nationality__region='GCC')

        if gender:
            qs = qs.filter(swimmer__sex=gender)
        if year:
            qs = qs.filter(championship__date__year=int(year))
        if pool:
            qs = qs.filter(championship__pool=pool)

        # Age group filter
        # OPEN = best times regardless of age (no filter)
        if age_group and age_group != 'OPEN':
            try:
                max_age = int(age_group.replace('U', ''))
                qs = qs.filter(
                    age_at_competition__lt=max_age,
                )
            except (ValueError, AttributeError):
                pass

        # Get best time per swimmer using DB aggregation
        best_times = (
            qs.values('swimmer_id')
            .annotate(best_time=Min('time_centiseconds'))
            .order_by('best_time')
        )

        # Now fetch the full result rows for those best times
        swimmer_best = {row['swimmer_id']: row['best_time'] for row in best_times}

        # Get the actual Result objects matching the best times
        results = []
        for result in qs.order_by('time_centiseconds'):
            if result.swimmer_id in swimmer_best and result.time_centiseconds == swimmer_best[result.swimmer_id]:
                results.append(result)
                del swimmer_best[result.swimmer_id]  # only take first match
            if not swimmer_best:
                break

        # Sort by time
        results.sort(key=lambda r: r.time_centiseconds)

        # Paginate
        paginator = RankingPagination()
        page = paginator.paginate_queryset(results, request)

        data = []
        start_rank = (paginator.page.number - 1) * paginator.page_size + 1 if page else 1
        results_to_serialize = page if page else results
        for i, result in enumerate(results_to_serialize):
            data.append({
                'rank': start_rank + i,
                'swimmer_id': result.swimmer.id,
                'swimmer_name': result.swimmer.name,
                'nationality': result.swimmer.nationality.name,
                'nationality_code': result.swimmer.nationality.code,
                'time': result.formatted_time,
                'time_centiseconds': result.time_centiseconds,
                'championship_name': result.championship.name,
                'championship_location': result.championship.location,
                'championship_country': result.championship.country.name if result.championship.country else '',
                'championship_country_code': result.championship.country.code if result.championship.country else '',
                'championship_country_flag': result.championship.country.flag_url if result.championship.country else '',
                'fina_points': result.fina_points,
                'date': result.championship.date.strftime('%d/%m/%Y'),
            })

        if page:
            return paginator.get_paginated_response(data)
        return Response(data)
