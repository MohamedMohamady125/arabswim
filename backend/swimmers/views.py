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
    queryset = Swimmer.objects.select_related('nationality', 'account').prefetch_related('nicknames')
    pagination_class = SwimmerPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name', 'date_of_birth', 'created_at']

    # Fields a verified athlete may edit on their own profile
    ATHLETE_EDITABLE = {'email', 'phone', 'instagram_url', 'facebook_url'}

    def get_permissions(self):
        if self.action in ('partial_update', 'update', 'upload_photo'):
            from core.permissions import CanEditOwnSwimmer
            return [CanEditOwnSwimmer()]
        return super().get_permissions()

    def partial_update(self, request, *args, **kwargs):
        from core.permissions import is_admin
        if not is_admin(request.user):
            bad = set(request.data.keys()) - self.ATHLETE_EDITABLE
            if bad:
                return Response(
                    {'error': f'You may only edit: {", ".join(sorted(self.ATHLETE_EDITABLE))}'},
                    status=400,
                )
        return super().partial_update(request, *args, **kwargs)

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
        swimmers = Swimmer.objects.select_related('nationality').filter(
            name__icontains=q).exclude(
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
                'nationality': s.nationality.name if s.nationality else '',
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

    @action(detail=True, methods=['get'], url_path='qualifying-gaps')
    def qualifying_gaps(self, request, pk=None):
        """Return the swimmer's qualifying gaps using current-year best times."""
        swimmer = self.get_object()
        from championships.models import Result
        from qualifying_times.models import QualifyingTime, QualifyingStandard
        from django.db.models import Min
        from django.utils import timezone
        from importer.parsers.base import format_centiseconds

        # Use the requested standard, or fall back to the latest one
        standard_id = request.query_params.get('standard')
        standard = None
        if standard_id:
            standard = QualifyingStandard.objects.filter(id=standard_id).first()
        if not standard:
            standard = QualifyingStandard.objects.first()
        if not standard:
            return Response([])

        current_year = timezone.now().year

        gaps = []
        # Check both LCM and SCM qualifying times
        for pool in ('LCM', 'SCM'):
            # Get swimmer's best times per event for this pool in the current year
            base_qs = Result.objects.filter(
                swimmer=swimmer,
                championship__pool=pool,
                time_centiseconds__gt=0,
                event__is_relay=False,
            )
            bests = (
                base_qs.filter(championship__date__year=current_year)
                .values('event__id', 'event__name')
                .annotate(best_cs=Min('time_centiseconds'))
            )
            best_by_event = {b['event__id']: b for b in bests}
            basis = 'current_year'
            if not best_by_event:
                # No current-season swims — fall back to all-time bests so the
                # tab still shows meaningful gaps for every swimmer.
                bests = (
                    base_qs.values('event__id', 'event__name')
                    .annotate(best_cs=Min('time_centiseconds'))
                )
                best_by_event = {b['event__id']: b for b in bests}
                basis = 'all_time'
            if not best_by_event:
                continue

            # Get qualifying times for swimmer's gender, this pool, and matching events
            qt_qs = QualifyingTime.objects.filter(
                standard=standard,
                gender=swimmer.sex,
                pool=pool,
                event_id__in=best_by_event.keys(),
            ).select_related('event')

            for qt in qt_qs:
                best = best_by_event.get(qt.event_id)
                if not best:
                    continue
                gap_cs = best['best_cs'] - qt.time_centiseconds
                pct = round((best['best_cs'] / qt.time_centiseconds - 1) * 100, 2) if qt.time_centiseconds else 0
                gaps.append({
                    'event_id': qt.event_id,
                    'event_name': best['event__name'],
                    'cut': qt.cut,
                    'pool': pool,
                    'standard_name': standard.name,
                    'swimmer_best_cs': best['best_cs'],
                    'swimmer_best': format_centiseconds(best['best_cs']),
                    'qualifying_cs': qt.time_centiseconds,
                    'qualifying_time': format_centiseconds(qt.time_centiseconds),
                    'gap_cs': gap_cs,
                    'gap_time': format_centiseconds(abs(gap_cs)),
                    'gap_pct': pct,
                    'qualified': gap_cs <= 0,
                    'basis': basis,
                })

        # Sort by gap (closest first)
        gaps.sort(key=lambda g: (g['pool'], g['cut'], g['gap_cs']))

        return Response(gaps)

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
                    'is_hc': r.is_hc,
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
                    'is_hc': r.is_hc,
                    'hc_type': r.hc_type,
                    'splits': r.splits or [],
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
            'country', 'classification_category', 'classification').order_by('-date')
        champs_data = [{
            'id': c.id, 'name': c.name, 'date': c.date,
            'pool': c.pool,
            'country': c.country.name if c.country else '',
            'country_code': c.country.code if c.country else '',
            'flag_url': c.country.flag_url if c.country else '',
            'category': c.classification_category.name if c.classification_category else '',
            'classification': c.classification.name if c.classification else '',
        } for c in championships]

        # Medal summary
        medals_qs = Medal.objects.filter(swimmer=swimmer)
        medal_counts = medals_qs.aggregate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        )
        # International medals only (exclude National/Other classification categories)
        intl_medals_qs = medals_qs.exclude(
            championship__classification_category__name__in=['National', 'Other']
        )
        intl_medal_counts = intl_medals_qs.aggregate(
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

        # Best FINA points this season — fall back to the swimmer's most
        # recent active season when they have no current-year results.
        from datetime import date as _date
        season_year = _date.today().year
        season_qs = Result.objects.filter(
            swimmer=swimmer, fina_points__isnull=False)
        if not season_qs.filter(championship__date__year=season_year).exists():
            latest_date = (season_qs.order_by('-championship__date')
                           .values_list('championship__date', flat=True).first())
            if latest_date:
                season_year = latest_date.year
        season_best_result = season_qs.filter(
            championship__date__year=season_year,
        ).select_related('event', 'championship').order_by('-fina_points').first()
        season_best_fina = None
        if season_best_result:
            season_best_fina = {
                'points': season_best_result.fina_points,
                'event_name': season_best_result.event.name,
                'championship_name': season_best_result.championship.name,
                'championship_id': season_best_result.championship.id,
                'year': season_year,
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

        # FINA points distribution — count of results in each tier range
        fina_results = list(
            Result.objects.filter(swimmer=swimmer, fina_points__isnull=False)
            .values_list('fina_points', flat=True)
        )
        tier_ranges = [
            (1000, 1200, 'World-Class'),
            (900, 999, 'International Elite'),
            (800, 899, 'Elite'),
            (700, 799, 'High Performance'),
            (600, 699, 'Advanced'),
            (500, 599, 'Competitive'),
            (400, 499, 'Developing'),
            (300, 399, 'Foundation'),
            (200, 299, 'Novice'),
            (100, 199, 'Entry Level'),
        ]
        fina_distribution = []
        for low, high, label in tier_ranges:
            count = sum(1 for p in fina_results if low <= p <= high)
            fina_distribution.append({'low': low, 'high': high, 'label': label, 'count': count})
        # Trim empty tiers from top and bottom
        while fina_distribution and fina_distribution[0]['count'] == 0:
            fina_distribution.pop(0)
        while fina_distribution and fina_distribution[-1]['count'] == 0:
            fina_distribution.pop()

        # Top 3 personal bests by FINA points (one per event, best time)
        from django.db.models import Subquery, OuterRef
        top_events = (
            Result.objects.filter(swimmer=swimmer, fina_points__isnull=False, fina_points__gt=0)
            .values('event_id').annotate(best_fina=Max('fina_points'))
            .order_by('-best_fina')[:3]
        )
        top_pbs = []
        for te in top_events:
            r = (Result.objects.filter(
                swimmer=swimmer, event_id=te['event_id'], fina_points=te['best_fina']
            ).select_related('event', 'championship').first())
            if r:
                top_pbs.append({
                    'event_name': r.event.name,
                    'time': format_centiseconds(r.time_centiseconds),
                    'fina_points': r.fina_points,
                    'meet_name': r.championship.name,
                    'meet_date': r.championship.date,
                })

        return Response({
            'total_championships': len(champs_data),
            'total_races': Result.objects.filter(swimmer=swimmer).count(),
            'championships': champs_data,
            'medals': medal_counts,
            'intl_medals': intl_medal_counts,
            'medals_by_level': medals_by_level,
            'medals_hierarchy': medals_hierarchy,
            'best_fina': best_fina,
            'season_best_fina': season_best_fina,
            'best_event': best_event_agg['event__name'] if best_event_agg else None,
            'records': records,
            'total_records': len(records),
            'fina_distribution': fina_distribution,
            'top_personal_bests': top_pbs,
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

    @action(detail=True, methods=['get'])
    def progression(self, request, pk=None):
        """Time progression for a swimmer's top 5 events (last 5 times each)."""
        swimmer = self.get_object()
        from championships.models import Result
        from django.db.models import Min, Count
        from importer.parsers.base import format_centiseconds

        pool = request.query_params.get('pool', 'LCM')

        # Find top 5 events by best FINA or most swims
        event_stats = (
            Result.objects.filter(
                swimmer=swimmer, swimmer__is_relay_team=False,
                championship__pool=pool, event__is_relay=False,
            )
            .values('event_id', 'event__name', 'event__stroke', 'event__sort_order')
            .annotate(count=Count('id'), best=Min('time_centiseconds'))
            .order_by('best')[:5]
        )

        lines = []
        for es in event_stats:
            results = (
                Result.objects.filter(
                    swimmer=swimmer, event_id=es['event_id'],
                    championship__pool=pool,
                )
                .select_related('championship')
                .order_by('-championship__date')[:5]
            )
            points = []
            for r in reversed(list(results)):
                points.append({
                    'date': r.championship.date.isoformat(),
                    'time': format_centiseconds(r.time_centiseconds),
                    'time_cs': r.time_centiseconds,
                    'meet': r.championship.name,
                    'fina': r.fina_points,
                })
            lines.append({
                'event_id': es['event_id'],
                'event_name': es['event__name'],
                'stroke': es['event__stroke'],
                'points': points,
            })
        return Response(lines)

    @action(detail=True, methods=['post'], url_path='change-nationality')
    def change_nationality(self, request, pk=None):
        """Admin: manually change a swimmer's nationality, recording a
        NationalityChange entry so it shows in transfer history."""
        import datetime
        from core.permissions import is_admin
        from core.models import Country
        from .models import NationalityChange

        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)

        swimmer = self.get_object()
        country_id = request.data.get('country')
        if not country_id:
            return Response({'error': 'country is required'}, status=400)
        try:
            country = Country.objects.get(pk=country_id)
        except Country.DoesNotExist:
            return Response({'error': 'Country not found'}, status=400)
        if swimmer.nationality_id == country.id:
            return Response({'error': 'Swimmer already has this nationality'}, status=400)

        raw_date = request.data.get('effective_date')
        if raw_date:
            try:
                effective_date = datetime.date.fromisoformat(raw_date)
            except ValueError:
                return Response({'error': 'effective_date must be YYYY-MM-DD'}, status=400)
        else:
            effective_date = datetime.date.today()

        NationalityChange.objects.create(
            swimmer=swimmer,
            from_country=swimmer.nationality,
            to_country=country,
            effective_date=effective_date,
            notes=request.data.get('notes', '') or '',
        )
        swimmer.nationality = country
        swimmer.save(update_fields=['nationality'])
        return Response(SwimmerDetailSerializer(swimmer).data)

    @action(detail=True, methods=['get'], url_path='transfer-history')
    def transfer_history(self, request, pk=None):
        """Club transfer history and nationality changes for a swimmer."""
        from django.db.models import Min, Max, Count, Q
        from championships.models import Result
        from .models import NationalityChange

        swimmer = self.get_object()

        # Club history derived from results
        all_results = Result.objects.filter(swimmer=swimmer, swimmer__is_relay_team=False)

        # Named clubs
        club_history = (
            all_results.exclude(team='').exclude(team__isnull=True)
            .values('team')
            .annotate(
                first_meet_date=Min('championship__date'),
                last_meet_date=Max('championship__date'),
                meets=Count('championship', distinct=True),
                results=Count('id'),
            )
            .order_by('first_meet_date')
        )

        # Merge duplicate club names using the canonical team key
        # (case-, punctuation- and squad-suffix-insensitive), so
        # "MC ALGER" / "Mc Alger" / "MC ALGER 2" / "Al-Ahly" / "AL AHLY"
        # all collapse into one club entry.
        import re
        from teams.utils import normalize_team_key, strip_squad_number
        merged = {}
        for c in club_history:
            # Normalize: strip, collapse whitespace, drop squad numbers
            name = strip_squad_number(c['team'].strip())
            normalized = re.sub(r'\s+', ' ', name)
            # If name ends with " X" where X is a single stray char, strip it
            candidate = re.sub(r'\s+\S$', '', normalized)
            cand_key = normalize_team_key(candidate)
            norm_key = normalize_team_key(normalized) or normalized.casefold()
            key = cand_key if cand_key and cand_key in merged else norm_key
            if key in merged:
                entry = merged[key]
                entry['meets'] += c['meets']
                entry['results'] += c['results']
                if c['first_meet_date'] < entry['first_meet_date']:
                    entry['first_meet_date'] = c['first_meet_date']
                if c['last_meet_date'] > entry['last_meet_date']:
                    entry['last_meet_date'] = c['last_meet_date']
                # Prefer the uppercase/longer display form
                if normalized.isupper() and not entry['club'].isupper():
                    entry['club'] = normalized
            else:
                merged[norm_key] = {
                    'club': normalized,
                    'first_meet_date': c['first_meet_date'],
                    'last_meet_date': c['last_meet_date'],
                    'meets': c['meets'],
                    'results': c['results'],
                }

        clubs = sorted([
            {
                'club': v['club'],
                'first_meet': str(v['first_meet_date']),
                'last_meet': str(v['last_meet_date']),
                'last_meet_date': v['last_meet_date'],
                'meets': v['meets'],
                'results': v['results'],
            }
            for v in merged.values()
        ], key=lambda c: c['first_meet'])

        # Attach club country info from Team records (matched by normalized name)
        from teams.models import Team
        from teams.utils import normalize_team_key
        team_by_key = {}
        for t in Team.objects.select_related('country'):
            team_by_key.setdefault(normalize_team_key(t.name), t)
        latest_date = max((c['last_meet_date'] for c in clubs), default=None)
        for c in clubs:
            t = team_by_key.get(normalize_team_key(c['club']))
            c['country'] = t.country.name if t else None
            c['country_code'] = t.country.code if t else None
            c['country_flag'] = t.country.flag_url if t else None
            c['is_national'] = bool(t and t.is_national_team)
        # A club stops being "current" the moment the swimmer competes for a
        # different club — only the most recent club is current. National
        # teams run in parallel with clubs, so they stay "current" while the
        # swimmer competed for them within a year of their latest meet.
        latest_club_date = max(
            (c['last_meet_date'] for c in clubs if not c['is_national']),
            default=None)
        for c in clubs:
            if c['is_national']:
                c['is_current'] = bool(
                    latest_date and (latest_date - c['last_meet_date']).days <= 365)
            else:
                c['is_current'] = c['last_meet_date'] == latest_club_date
            del c['last_meet_date']

        # Nationality changes
        changes = NationalityChange.objects.filter(swimmer=swimmer).select_related(
            'from_country', 'to_country')
        nationality_history = []
        for ch in changes:
            # Count meets under each nationality by date range
            nationality_history.append({
                'from_country': ch.from_country.name if ch.from_country else None,
                'from_country_code': ch.from_country.code if ch.from_country else None,
                'from_country_flag': ch.from_country.flag_url if ch.from_country else None,
                'to_country': ch.to_country.name,
                'to_country_code': ch.to_country.code,
                'to_country_flag': ch.to_country.flag_url,
                'effective_date': str(ch.effective_date),
                'notes': ch.notes,
            })

        # Single nationality entry — just current nationality with total meets
        total_meets = Result.objects.filter(
            swimmer=swimmer
        ).values('championship').distinct().count()
        nationality_meet_counts = [{
            'country': swimmer.nationality.name if swimmer.nationality else 'Unknown',
            'country_code': swimmer.nationality.code if swimmer.nationality else '',
            'country_flag': swimmer.nationality.flag_url if swimmer.nationality else '',
            'meets': total_meets,
        }]

        return Response({
            'clubs': clubs,
            'nationality_changes': nationality_history,
            'nationality_meet_counts': nationality_meet_counts,
        })

    @action(detail=True, methods=['get'])
    def rankings(self, request, pk=None):
        """Return the swimmer's ranking per event across national/GCC/Arab scopes.

        Each scope carries an OPEN rank plus an age-group rank (e.g. U17,
        derived from the swimmer's birth year: peers born the same year or
        later).
        """
        from datetime import date
        from django.db.models import Min, Q
        from championships.models import Result
        from importer.parsers.base import format_centiseconds

        swimmer = self.get_object()
        if not swimmer.nationality_id:
            return Response([])

        birth_year = (swimmer.date_of_birth.year if swimmer.date_of_birth
                      else swimmer.birth_year)
        age_label = None
        age_q = None
        if birth_year:
            age_num = date.today().year - birth_year + 1
            # Age-group rankings are a youth feature: swimmers up to U18 get
            # their age-band rank next to Open in every scope; older swimmers
            # rank in Open only (no meaningless "U22" cards).
            if age_num <= 18:
                age_label = f'U{age_num}'
                age_q = (Q(swimmer__date_of_birth__year__gte=birth_year) |
                         Q(swimmer__date_of_birth__isnull=True, swimmer__birth_year__gte=birth_year))

        nat = swimmer.nationality
        # Determine which scopes apply
        scopes = {'national': {'swimmer__nationality_id': nat.id}}
        if nat.region in ('GCC', 'ARAB'):
            scopes['arab'] = {'swimmer__nationality__region__in': ['ARAB', 'GCC']}
        if nat.region == 'GCC':
            scopes['gcc'] = {'swimmer__nationality__region': 'GCC'}

        # Best time per event+pool for this swimmer (individual, non-HC)
        swimmer_bests = (
            Result.objects.filter(
                swimmer=swimmer,
                swimmer__is_relay_team=False,
                is_hc=False,
                time_centiseconds__gt=0,
            )
            .values('event_id', 'championship__pool')
            .annotate(best=Min('time_centiseconds'))
        )

        gender = swimmer.sex  # rank within same gender

        data = []
        for row in swimmer_bests:
            eid = row['event_id']
            pool = row['championship__pool'] or ''
            best = row['best']

            ranks = {}
            for scope_name, scope_filter in scopes.items():
                base_qs = Result.objects.filter(
                    event_id=eid,
                    championship__pool=pool,
                    is_hc=False,
                    time_centiseconds__gt=0,
                    swimmer__is_relay_team=False,
                    swimmer__sex=gender,
                    **scope_filter,
                )

                def _rank(qs):
                    # Count distinct swimmers with a strictly better best time
                    better_count = (
                        qs.values('swimmer_id')
                        .annotate(pb=Min('time_centiseconds'))
                        .filter(pb__lt=best)
                        .count()
                    )
                    total = qs.values('swimmer_id').distinct().count()
                    return {'rank': better_count + 1, 'total': total}

                ranks[scope_name] = _rank(base_qs)
                if age_q is not None:
                    age_rank = _rank(base_qs.filter(age_q))
                    age_rank['label'] = age_label
                    ranks[scope_name]['age'] = age_rank

            data.append({
                'event_id': eid,
                'pool': pool,
                'best_time': format_centiseconds(best),
                'best_time_centiseconds': best,
                'rankings': ranks,
            })

        return Response(data)

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
