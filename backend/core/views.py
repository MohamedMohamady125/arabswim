from rest_framework import viewsets, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Country, Event
from .serializers import UserSerializer, CountrySerializer, EventSerializer

User = get_user_model()


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


def _fmt_cs(cs):
    minutes = cs // 6000
    seconds = (cs % 6000) // 100
    centis = cs % 100
    if minutes:
        return f'{minutes}:{seconds:02d}.{centis:02d}'
    return f'{seconds}.{centis:02d}'


class CountryViewSet(viewsets.ModelViewSet):
    queryset = Country.objects.all()
    serializer_class = CountrySerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if request.query_params.get('with_stats'):
            from django.db.models import Count
            from django.db.models import Q
            counts = dict(
                Country.objects.annotate(
                    n=Count('swimmers', filter=Q(swimmers__is_relay_team=False))
                ).values_list('id', 'n')
            )
            for row in response.data:
                row['swimmers_count'] = counts.get(row['id'], 0)
        return response

    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        """Everything we know about one country, aggregated for its profile page."""
        from django.db.models import Count, Q, Min
        from championships.models import Result
        from medals.models import Medal
        from records.models import Record

        country = self.get_object()

        swimmer_counts = country.swimmers.filter(is_relay_team=False).aggregate(
            total=Count('id'), male=Count('id', filter=Q(sex='M')),
            female=Count('id', filter=Q(sex='F')),
        )
        results_qs = Result.objects.filter(swimmer__nationality=country)
        medals_qs = Medal.objects.filter(swimmer__nationality=country)
        medal_counts = medals_qs.aggregate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        )
        records_qs = Record.objects.filter(swimmer__nationality=country)

        stats = {
            'swimmers': swimmer_counts['total'],
            'swimmers_male': swimmer_counts['male'],
            'swimmers_female': swimmer_counts['female'],
            'results': results_qs.count(),
            'championships_hosted': country.championships.count(),
            'teams': country.teams.count(),
            'records': records_qs.count(),
            'medals': medal_counts['total'],
        }

        # Top swimmers by best FINA (best single swim each)
        top_swimmers = []
        seen = set()
        fina_qs = (results_qs.filter(fina_points__isnull=False, swimmer__is_relay_team=False)
                   .select_related('swimmer', 'event', 'championship')
                   .order_by('-fina_points'))
        for r in fina_qs[:400]:
            if r.swimmer_id in seen:
                continue
            seen.add(r.swimmer_id)
            top_swimmers.append({
                'id': r.swimmer_id, 'name': r.swimmer.name, 'sex': r.swimmer.sex,
                'club': r.swimmer.club, 'best_fina': r.fina_points,
                'best_event': r.event.name, 'best_time': _fmt_cs(r.time_centiseconds),
                'championship': r.championship.name,
            })
            if len(top_swimmers) >= 12:
                break

        # National best time per event / sex / pool (individual events)
        groups = (results_qs.filter(event__is_relay=False, time_centiseconds__gt=0)
                  .values('event_id', 'swimmer__sex', 'championship__pool')
                  .annotate(best=Min('time_centiseconds')))
        best_lookup = {(g['event_id'], g['swimmer__sex'], g['championship__pool']): g['best']
                       for g in groups}
        best_times = []
        if best_lookup:
            filt = Q()
            for (event_id, sex, pool), cs in best_lookup.items():
                filt |= Q(event_id=event_id, swimmer__sex=sex,
                          championship__pool=pool, time_centiseconds=cs)
            best_rows = (results_qs.filter(filt)
                         .select_related('event', 'swimmer', 'championship')
                         .order_by('event__sort_order', 'event__distance'))
            emitted = set()
            for r in best_rows:
                key = (r.event_id, r.swimmer.sex, r.championship.pool)
                if key in emitted:
                    continue
                emitted.add(key)
                best_times.append({
                    'event': r.event.name, 'sex': r.swimmer.sex,
                    'pool': r.championship.pool,
                    'time': _fmt_cs(r.time_centiseconds),
                    'fina': r.fina_points,
                    'swimmer_id': r.swimmer_id, 'swimmer': r.swimmer.name,
                    'age_at_competition': r.age_at_competition,
                    'championship': r.championship.name,
                    'date': r.championship.date,
                })

        records = [{
            'id': rec.id, 'record_type': rec.record_type, 'event': rec.event.name,
            'swimmer_id': rec.swimmer_id, 'swimmer': rec.swimmer.name,
            'sex': rec.swimmer.sex, 'time': _fmt_cs(rec.time_centiseconds),
            'location': rec.location, 'date': rec.result_date, 'is_new': rec.is_new,
        } for rec in records_qs.select_related('event', 'swimmer')
            .order_by('event__sort_order', 'event__distance')]

        top_medalists = list(
            medals_qs.filter(swimmer__is_relay_team=False)
            .values('swimmer_id', 'swimmer__name')
            .annotate(gold=Count('id', filter=Q(medal_type='GOLD')),
                      silver=Count('id', filter=Q(medal_type='SILVER')),
                      bronze=Count('id', filter=Q(medal_type='BRONZE')),
                      total=Count('id'))
            .order_by('-gold', '-silver', '-bronze')[:10]
        )
        for m in top_medalists:
            m['id'] = m.pop('swimmer_id')
            m['name'] = m.pop('swimmer__name')

        championships_hosted = [{
            'id': c.id, 'name': c.name, 'date': c.date, 'pool': c.pool,
            'location': c.location,
        } for c in country.championships.all()[:25]]

        # Championships participated: every championship where this country has results
        from championships.models import Championship
        participated_ids = (results_qs.values_list('championship_id', flat=True)
                            .distinct())
        participated_champs = (Championship.objects
                               .filter(id__in=participated_ids)
                               .select_related('country')
                               .order_by('-date'))
        championships_participated = []
        for c in participated_champs:
            c_medals = medals_qs.filter(championship=c)
            c_medal_counts = c_medals.aggregate(
                gold=Count('id', filter=Q(medal_type='GOLD')),
                silver=Count('id', filter=Q(medal_type='SILVER')),
                bronze=Count('id', filter=Q(medal_type='BRONZE')),
                total=Count('id'),
            )
            c_results_count = results_qs.filter(championship=c).count()
            c_swimmer_ids = (results_qs.filter(championship=c, swimmer__is_relay_team=False)
                             .values_list('swimmer_id', flat=True).distinct())
            from swimmers.models import Swimmer as Sw
            c_swimmers = list(
                Sw.objects.filter(id__in=c_swimmer_ids)
                .values('id', 'name', 'sex')
                .order_by('name')
            )
            championships_participated.append({
                'id': c.id, 'name': c.name, 'date': c.date, 'pool': c.pool,
                'location': c.location,
                'results_count': c_results_count,
                'swimmers_count': len(c_swimmers),
                'swimmers': c_swimmers,
                'medals': c_medal_counts,
            })

        teams = [{
            'id': t.id, 'name': t.name, 'is_national_team': t.is_national_team,
        } for t in country.teams.all()]

        return Response({
            'country': CountrySerializer(country).data,
            'stats': stats,
            'medals': medal_counts,
            'top_swimmers': top_swimmers,
            'top_medalists': top_medalists,
            'best_times': best_times,
            'records': records,
            'championships_hosted': championships_hosted,
            'championships_participated': championships_participated,
            'teams': teams,
        })


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    pagination_class = None
