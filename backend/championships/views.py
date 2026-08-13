from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from .models import ClassificationCategory, Classification, SubClassification, Championship, ProgramItem, Result
from .serializers import (
    ClassificationCategorySerializer, ClassificationSerializer, SubClassificationSerializer,
    ChampionshipListSerializer, ChampionshipDetailSerializer,
    ProgramItemSerializer, ResultSerializer, ResultCreateSerializer
)


class ClassificationCategoryViewSet(viewsets.ModelViewSet):
    queryset = ClassificationCategory.objects.all()
    serializer_class = ClassificationCategorySerializer
    pagination_class = None


class ClassificationViewSet(viewsets.ModelViewSet):
    queryset = Classification.objects.all()
    serializer_class = ClassificationSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        return qs


class SubClassificationViewSet(viewsets.ModelViewSet):
    queryset = SubClassification.objects.all()
    serializer_class = SubClassificationSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        classification = self.request.query_params.get('classification')
        if classification:
            qs = qs.filter(classification_id=classification)
        return qs


class ChampionshipPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 10000


class ChampionshipViewSet(viewsets.ModelViewSet):
    queryset = Championship.objects.select_related('country', 'classification', 'sub_classification')
    pagination_class = ChampionshipPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['date', 'name']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.action == 'list':
            return ChampionshipListSerializer
        return ChampionshipDetailSerializer

    @action(detail=True, methods=['get', 'put'])
    def program(self, request, pk=None):
        """Day-by-day meet program.

        GET (public): {'days': [{day, date, items: [...]}]} — one entry per
        meet day (Day 1 = start date), even when a day has no events yet.
        PUT (admin): replaces the whole program with
        {'items': [{day, event, gender, order}]}."""
        from datetime import timedelta
        champ = self.get_object()
        if request.method == 'PUT':
            ser = ProgramItemSerializer(data=request.data.get('items', []), many=True)
            ser.is_valid(raise_exception=True)
            ProgramItem.objects.filter(championship=champ).delete()
            seen = set()
            rows = []
            for row in ser.validated_data:
                key = (row['day'], row['event'].id, row.get('gender', 'X'),
                       row.get('session', ''), row.get('age_category', ''))
                if key in seen:
                    continue
                seen.add(key)
                rows.append(ProgramItem(championship=champ, **row))
            ProgramItem.objects.bulk_create(rows)
        by_day = {}
        for item in ProgramItem.objects.filter(championship=champ).select_related('event'):
            by_day.setdefault(item.day, []).append(item)
        n_days = 1
        if champ.end_date and champ.end_date >= champ.date:
            n_days = min((champ.end_date - champ.date).days + 1, 30)
        n_days = max(n_days, max(by_day, default=1))
        days = [{
            'day': d,
            'date': str(champ.date + timedelta(days=d - 1)),
            'items': ProgramItemSerializer(by_day.get(d, []), many=True).data,
        } for d in range(1, n_days + 1)]
        return Response({'days': days})

    def perform_update(self, serializer):
        old_flags = None
        if serializer.instance is not None:
            old_flags = (serializer.instance.has_double_podium,
                         serializer.instance.has_open_podium,
                         serializer.instance.b_final_no_medals)
        championship = serializer.save()
        # Classifying a meet after import (e.g. Other/France) tells us which
        # country its clubs belong to — reapply the club-country rule so
        # foreign clubs aren't left tagged with a swimmer's nationality.
        from teams.utils import apply_subclassification_country
        apply_subclassification_country(championship)
        # Podium rules changed → medals must be re-awarded
        new_flags = (championship.has_double_podium, championship.has_open_podium,
                     championship.b_final_no_medals)
        if old_flags is not None and old_flags != new_flags:
            from medals.utils import recompute_medals
            recompute_medals(championship)

    def get_queryset(self):
        qs = super().get_queryset()
        # List-only filters. They must NOT apply to detail actions: e.g.
        # country-swimmers is called with ?country=<nationality>, and
        # filtering the base queryset by host country would 404 get_object.
        if self.action != 'list':
            return qs
        from django.db.models import Count, Q
        # Calendar-only meets (added from the calendar, no results yet)
        # stay out of the meets list unless explicitly requested.
        if not self.request.query_params.get('include_calendar_only'):
            qs = qs.filter(is_calendar_only=False)
        # Unpublished meets stay off the championships list and calendar;
        # admin tools (manual entry search) pass include_unpublished=1.
        if not self.request.query_params.get('include_unpublished'):
            qs = qs.filter(is_published=True)
        qs = qs.annotate(
            results_count_annotated=Count('results'),
            swimmers_count_annotated=Count(
                'results__swimmer',
                filter=Q(results__swimmer__is_relay_team=False),
                distinct=True,
            ),
        )
        pool = self.request.query_params.get('pool')
        country = self.request.query_params.get('country')
        year = self.request.query_params.get('year')
        classification = self.request.query_params.get('classification')
        sub_classification = self.request.query_params.get('sub_classification')
        if pool:
            qs = qs.filter(pool=pool)
        if country:
            qs = qs.filter(country_id=country)
        if year:
            qs = qs.filter(date__year=int(year))
        if classification:
            qs = qs.filter(classification_id=classification)
        if sub_classification:
            qs = qs.filter(sub_classification_id=sub_classification)
        if self.request.query_params.get('upcoming'):
            from datetime import date as _date
            qs = qs.filter(date__gte=_date.today())
        return qs

    def destroy(self, request, *args, **kwargs):
        championship = self.get_object()
        # Get swimmers who have results ONLY in this championship
        from swimmers.models import Swimmer
        from django.db.models import Count, Q
        swimmer_ids = list(
            championship.results.values_list('swimmer_id', flat=True).distinct()
        )
        # Delete the championship (cascades to results, medals, calendar_events, imports)
        response = super().destroy(request, *args, **kwargs)
        # Clean up orphan swimmers — but only truly orphaned rows: no
        # results in any other championship AND no medals, records or
        # hall-of-fame entries pointing at them.
        if swimmer_ids:
            orphans = Swimmer.objects.filter(
                id__in=swimmer_ids,
                results__isnull=True,
                medals__isnull=True,
                records__isnull=True,
                hall_of_fame_entries__isnull=True,
            )
            orphans.delete()
        from teams.utils import cleanup_orphan_teams
        cleanup_orphan_teams()
        return response

    @action(detail=True, methods=['post'], url_path='upload-pdf')
    def upload_pdf(self, request, pk=None):
        championship = self.get_object()
        pdf_file = request.FILES.get('pdf_file')
        from core.uploads import validate_pdf
        err = validate_pdf(pdf_file)
        if err:
            return Response({'error': err}, status=400)
        championship.pdf_file = pdf_file
        championship.save()
        return Response({'message': 'PDF uploaded successfully'})

    @action(detail=True, methods=['post'], url_path='import-excel')
    def import_excel(self, request, pk=None):
        championship = self.get_object()
        excel_file = request.FILES.get('excel_file')
        if not excel_file:
            return Response({'error': 'No Excel file provided'}, status=400)
        # TODO: Parse excel and create results
        return Response({'message': 'Excel import started'})

    @action(detail=True, methods=['get', 'post'])
    def results(self, request, pk=None):
        championship = self.get_object()
        if request.method == 'GET':
            event_id = request.query_params.get('event')
            gender = request.query_params.get('gender')
            show_all_rounds = request.query_params.get('all_rounds')
            results = championship.results.select_related('swimmer', 'swimmer__nationality', 'nationality', 'event')
            if event_id:
                results = results.filter(event_id=event_id)
            if gender:
                # Mixed relays have both M and F placeholder swimmers;
                # don't filter by sex when the caller requests 'X' (Mixed).
                if gender != 'X':
                    results = results.filter(swimmer__sex=gender)
            # By default, show only the best round per swimmer per event
            # If Finals exist for this event, show only Finals
            # Otherwise show all (timed finals / single round)
            if not show_all_rounds and event_id:
                rounds = set(results.values_list('round_type', flat=True))
                if 'Finals' in rounds and len(rounds) > 1:
                    results = results.filter(round_type='Finals')
                elif 'Prelims' in rounds and '' in rounds and len(rounds) > 1:
                    # Has both prelims and unlabeled — keep unlabeled (likely timed finals)
                    results = results.exclude(round_type='Prelims')
            serializer = ResultSerializer(results, many=True)
            return Response(serializer.data)
        else:
            data = request.data.copy()
            data['championship'] = championship.id
            serializer = ResultCreateSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            # Manual single-result entries never receive automatic medals —
            # only the medal explicitly assigned in the form (if any).
            result = serializer.save(championship=championship, is_manual=True)
            if championship.is_calendar_only:
                championship.is_calendar_only = False
                championship.save(update_fields=['is_calendar_only'])
            # Auto-compute age at competition from the swimmer's stored
            # birth data when the caller didn't supply it
            sw = result.swimmer
            if (result.age_at_competition is None and championship.date
                    and not sw.is_relay_team):
                d = championship.date
                if sw.date_of_birth:
                    result.age_at_competition = d.year - sw.date_of_birth.year - (
                        (d.month, d.day) <
                        (sw.date_of_birth.month, sw.date_of_birth.day))
                elif sw.birth_year:
                    result.age_at_competition = d.year - sw.birth_year
                if result.age_at_competition is not None:
                    result.save(update_fields=['age_at_competition'])
            # Optional medals for this result. Stored with result=None so
            # they count as manually entered and survive medal recomputes.
            # `medal` is the age-category podium; `open_medal` is the extra
            # open/TC podium — double-podium meets can award both.
            from medals.models import Medal
            for field, scope in (('medal', 'CATEGORY'), ('open_medal', 'OPEN')):
                medal_type = str(request.data.get(field) or '').upper()
                if medal_type in ('GOLD', 'SILVER', 'BRONZE'):
                    Medal.objects.update_or_create(
                        swimmer=result.swimmer,
                        championship=championship,
                        event=result.event,
                        result=None,
                        scope=scope,
                        defaults={'medal_type': medal_type},
                    )
            return Response(ResultCreateSerializer(result).data, status=201)

    @action(detail=True, methods=['post'], url_path='add-results')
    def add_results(self, request, pk=None):
        """Bulk-add results for one event/round (manual data entry).

        Payload: {event, gender, round_type, category, rows: [
            {name, birth_year, country, team, time}, ...]}
        Age at competition is computed from the swimmer's stored birth data.
        Swimmers are matched with the same rules as the PDF importer
        (exact name + birth year / age band), created when new.
        """
        from datetime import date as _date
        from core.models import Event
        from swimmers.models import Swimmer
        from importer.parsers.base import parse_time_to_centiseconds, ParsedResult
        from importer.matcher import find_matching_swimmer, resolve_country, category_band
        from importer.points import calculate_points

        championship = self.get_object()
        data = request.data
        try:
            event = Event.objects.get(id=int(data.get('event')))
        except (Event.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Valid event id required'}, status=400)
        gender = data.get('gender', 'M')
        if gender not in ('M', 'F'):
            gender = 'M'
        round_type = data.get('round_type', '') or ''
        category = (data.get('category', '') or '').strip()
        rows = data.get('rows') or []
        if not rows:
            return Response({'error': 'rows required'}, status=400)

        band = category_band(category)
        created = updated = 0
        created_swimmers = matched_swimmers = 0
        errors = []

        for i, row in enumerate(rows):
            from teams.utils import strip_squad_number
            name = (row.get('name') or '').strip()
            if event.is_relay:
                name = strip_squad_number(name)
            time_text = (row.get('time') or '').strip()
            if not name or not time_text:
                errors.append({'row': i + 1, 'reason': 'Name and time are required'})
                continue
            time_cs = parse_time_to_centiseconds(time_text)
            if not time_cs or time_cs <= 0:
                errors.append({'row': i + 1, 'reason': f'Invalid time "{time_text}"'})
                continue
            try:
                birth_year = int(row.get('birth_year') or 0)
            except (TypeError, ValueError):
                birth_year = 0
            team = strip_squad_number(row.get('team') or '')

            if event.is_relay:
                swimmer = Swimmer.objects.filter(
                    name__iexact=name, sex=gender, is_relay_team=True).first()
            else:
                pr = ParsedResult(
                    swimmer_name=name, time_text='', birth_year=birth_year,
                    nationality_code=(row.get('country') or '').strip(),
                )
                swimmer, _conf, _mtype = find_matching_swimmer(
                    pr, category=band, meet_date=championship.date)
            if swimmer:
                matched_swimmers += 1
            else:
                nationality = resolve_country((row.get('country') or '').strip()) \
                    or championship.country
                swimmer = Swimmer.objects.create(
                    name=name,
                    birth_year=birth_year or None,
                    nationality=nationality,
                    sex=gender,
                    club=name if event.is_relay else team,
                    is_relay_team=event.is_relay,
                )
                created_swimmers += 1

            fina = calculate_points(time_cs, event.name, gender, championship.pool)
            # Age at competition, computed automatically from the swimmer's
            # stored birth data (exact DOB when known, else birth year)
            age = None
            if championship.date and not event.is_relay:
                dob = getattr(swimmer, 'date_of_birth', None)
                by = birth_year or getattr(swimmer, 'birth_year', None) or 0
                if dob:
                    age = championship.date.year - dob.year - (
                        (championship.date.month, championship.date.day) <
                        (dob.month, dob.day))
                elif by:
                    age = championship.date.year - by

            existing = Result.objects.filter(
                swimmer=swimmer, championship=championship, event=event,
                round_type=round_type, category=category,
            ).first()
            if existing:
                if time_cs < existing.time_centiseconds:
                    existing.time_centiseconds = time_cs
                    existing.fina_points = fina or existing.fina_points
                    if team:
                        existing.team = team
                    existing.save()
                    updated += 1
                else:
                    errors.append({'row': i + 1,
                                   'reason': f'{name}: already has an equal or better time in this event/round'})
                continue

            Result.objects.create(
                swimmer=swimmer, championship=championship, event=event,
                round_type=round_type, category=category,
                team=name if event.is_relay else team,
                time_centiseconds=time_cs,
                fina_points=fina or None,
                age_at_competition=age,
                is_manual=True,
            )
            created += 1

        # Manual entries NEVER receive automatic medals — medals are only
        # auto-awarded during meet imports, or assigned explicitly by hand.
        if created or updated:
            if championship.is_calendar_only:
                championship.is_calendar_only = False
                championship.save(update_fields=['is_calendar_only'])

        return Response({
            'created': created,
            'updated': updated,
            'created_swimmers': created_swimmers,
            'matched_swimmers': matched_swimmers,
            'errors': errors,
        })

    @action(detail=True, methods=['get'], url_path='club-swimmers')
    def club_swimmers(self, request, pk=None):
        """Swimmers from one club/team at this championship, with their best swim."""
        from django.db.models import Count, Max
        from importer.parsers.base import format_centiseconds
        championship = self.get_object()
        club = request.query_params.get('club')
        if not club:
            return Response({'error': 'club query param required'}, status=400)
        results = championship.results.filter(
            team__iexact=club,
            swimmer__is_relay_team=False,
        ).select_related('swimmer', 'swimmer__nationality', 'nationality', 'event')

        swimmers = {}
        for r in results:
            s = swimmers.setdefault(r.swimmer_id, {
                'swimmer_id': r.swimmer_id,
                'name': r.swimmer.name,
                'sex': r.swimmer.sex,
                'birth_year': r.swimmer.birth_year,
                'photo': r.swimmer.photo.url if r.swimmer.photo else None,
                'nationality_code': (r.nationality or r.swimmer.nationality).code if (r.nationality or r.swimmer.nationality) else '',
                'nationality_flag': (r.nationality or r.swimmer.nationality).flag_url if (r.nationality or r.swimmer.nationality) else '',
                'nationality_name': (r.nationality or r.swimmer.nationality).name if (r.nationality or r.swimmer.nationality) else '',
                'events': set(),
                'results_count': 0,
                'best_fina': 0,
                'best_event': '',
                'best_time': '',
            })
            s['events'].add(r.event_id)
            s['results_count'] += 1
            if (r.fina_points or 0) > s['best_fina']:
                s['best_fina'] = r.fina_points or 0
                s['best_event'] = r.event.name
                s['best_time'] = format_centiseconds(r.time_centiseconds)

        data = sorted(swimmers.values(), key=lambda s: (-s['best_fina'], s['name']))
        for s in data:
            s['events_count'] = len(s.pop('events'))
        return Response(data)

    @action(detail=True, methods=['get'], url_path='country-swimmers')
    def country_swimmers(self, request, pk=None):
        """Swimmers from one country at this championship, with their best swim."""
        from django.db.models import Count, Max
        from importer.parsers.base import format_centiseconds
        championship = self.get_object()
        country_id = request.query_params.get('country')
        if not country_id:
            return Response({'error': 'country query param required'}, status=400)
        results = championship.results.filter(
            nationality_id=country_id,
            event__is_relay=False,  # relay rows use team pseudo-swimmers
        ).select_related('swimmer', 'event')

        swimmers = {}
        for r in results:
            s = swimmers.setdefault(r.swimmer_id, {
                'swimmer_id': r.swimmer_id,
                'name': r.swimmer.name,
                'sex': r.swimmer.sex,
                'birth_year': r.swimmer.birth_year,
                'photo': r.swimmer.photo.url if r.swimmer.photo else None,
                'events': set(),
                'results_count': 0,
                'best_fina': 0,
                'best_event': '',
                'best_time': '',
            })
            s['events'].add(r.event_id)
            s['results_count'] += 1
            if (r.fina_points or 0) > s['best_fina']:
                s['best_fina'] = r.fina_points or 0
                s['best_event'] = r.event.name
                s['best_time'] = format_centiseconds(r.time_centiseconds)

        data = sorted(swimmers.values(), key=lambda s: (-s['best_fina'], s['name']))
        for s in data:
            s['events_count'] = len(s.pop('events'))
        return Response(data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Get comprehensive stats for a championship."""
        from django.db.models import Count, Min, Q
        championship = self.get_object()
        results = championship.results.select_related('swimmer', 'swimmer__nationality', 'nationality', 'event')

        # Basic counts
        total_results = results.count()
        # Relay-team placeholders are not athletes — count real swimmers only
        athletes = results.filter(swimmer__is_relay_team=False)
        total_swimmers = athletes.values('swimmer').distinct().count()
        total_events = results.values('event').distinct().count()
        male_count = athletes.filter(swimmer__sex='M').values('swimmer').distinct().count()
        female_count = athletes.filter(swimmer__sex='F').values('swimmer').distinct().count()

        # Events split by gender.
        # Mixed relays contain both male and female placeholder swimmers;
        # group them under gender 'X' so they appear once, not twice.
        from django.db.models import Case, When, Value, CharField
        events = results.annotate(
            effective_gender=Case(
                When(event__name__icontains='mixed', then=Value('X')),
                default='swimmer__sex',
                output_field=CharField(),
            ),
        ).values(
            'event__id', 'event__name', 'event__distance', 'event__stroke',
            'event__sort_order', 'effective_gender'
        ).annotate(
            results_count=Count('id'),
            best_time=Min('time_centiseconds'),
        ).order_by('effective_gender', 'event__sort_order', 'event__distance')

        events_list = []
        for e in events:
            cs = e['best_time']
            mins = cs // 6000
            secs = (cs % 6000) // 100
            cent = cs % 100
            best = f'{mins}:{secs:02d}.{cent:02d}' if mins else f'{secs}.{cent:02d}'
            gender = e['effective_gender']
            gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, 'Men')
            events_list.append({
                'event_id': e['event__id'],
                'event_name': e['event__name'],
                'gender': gender,
                'gender_label': gender_label,
                'display_name': f"{e['event__name']} - {gender_label}",
                'results_count': e['results_count'],
                'best_time': best,
            })

        # Country breakdown
        countries = athletes.values(
            'nationality__id',
            'nationality__name', 'nationality__code', 'nationality__flag_url'
        ).annotate(
            swimmers_count=Count('swimmer', distinct=True),
            results_count=Count('id'),
        ).order_by('-swimmers_count')

        # Determine if this is a national/local meet (show clubs)
        is_club_meet = True  # show clubs for all meets
        cat_name = ''
        if championship.classification_category:
            cat_name = championship.classification_category.name.lower()

        # Club breakdown
        clubs = list(
            athletes.filter(swimmer__is_relay_team=False)
            .exclude(team='').exclude(team__isnull=True)
            .values('team')
            .annotate(
                swimmers_count=Count('swimmer', distinct=True),
                results_count=Count('id'),
            )
            .order_by('-swimmers_count')
        )
        # Attach club logos (same canonical team-key match as the medal tally)
        from teams.models import Team
        from teams.utils import normalize_team_key
        team_by_key = {}
        for t in Team.objects.only('id', 'name', 'logo'):
            team_by_key.setdefault(normalize_team_key(t.name), t)
        for row in clubs:
            t = team_by_key.get(normalize_team_key(row['team']))
            row['team_id'] = t.id if t else None
            row['team_logo'] = t.logo.url if t and t.logo else None

        # Top performers (best FINA points, deduplicated per swimmer+event)
        from django.db.models import Max, Subquery, OuterRef
        best_per_swimmer_event = (
            athletes.filter(fina_points__isnull=False, fina_points__gt=0)
            .values('swimmer_id', 'event_id')
            .annotate(max_fina=Max('fina_points'))
        )
        # Build lookup of best fina per (swimmer, event)
        best_lookup = {(r['swimmer_id'], r['event_id']): r['max_fina'] for r in best_per_swimmer_event}
        # Get all results, filter to only the best per swimmer+event
        top_candidates = athletes.filter(
            fina_points__isnull=False, fina_points__gt=0
        ).order_by('-fina_points').select_related('swimmer', 'swimmer__nationality', 'nationality', 'event')
        top_list = []
        seen = set()
        # Cap per gender, not overall — otherwise a men-dominant meet fills
        # the whole list and the Women filter shows almost nothing.
        gender_counts = {}
        for r in top_candidates:
            key = (r.swimmer_id, r.event_id)
            if key in seen:
                continue
            if gender_counts.get(r.swimmer.sex, 0) >= 30:
                continue
            if r.fina_points == best_lookup.get(key):
                seen.add(key)
                gender_counts[r.swimmer.sex] = gender_counts.get(r.swimmer.sex, 0) + 1
                top_list.append({
                    'swimmer_id': r.swimmer.id,
                    'swimmer_name': r.swimmer.name,
                    'gender': r.swimmer.sex,
                    'nationality': (r.nationality or r.swimmer.nationality).name if (r.nationality or r.swimmer.nationality) else '',
                    'nationality_code': (r.nationality or r.swimmer.nationality).code if (r.nationality or r.swimmer.nationality) else '',
                    'flag_url': (r.nationality or r.swimmer.nationality).flag_url if (r.nationality or r.swimmer.nationality) else '',
                    'photo': r.swimmer.photo.url if r.swimmer.photo else None,
                    'event_name': r.event.name,
                    'time': r.formatted_time,
                    'fina_points': r.fina_points,
                })
                if all(c >= 30 for c in gender_counts.values()) and len(gender_counts) >= 2:
                    break

        # Personal bests achieved at this meet
        # Use a subquery approach: get each swimmer+event best at this meet,
        # then compare with their all-time best in one aggregated query.
        personal_bests = []
        pb_candidates = list(athletes.filter(
            swimmer__is_relay_team=False, time_centiseconds__gt=0
        ).values('swimmer_id', 'event_id').annotate(
            meet_best=Min('time_centiseconds')
        ))
        if pb_candidates:
            # Get all-time bests in a single query for all swimmers at this meet
            swimmer_ids = list({pb['swimmer_id'] for pb in pb_candidates})
            all_time_rows = Result.objects.filter(
                swimmer_id__in=swimmer_ids,
                championship__pool=championship.pool,
                swimmer__is_relay_team=False,
                time_centiseconds__gt=0,
            ).values('swimmer_id', 'event_id').annotate(
                best=Min('time_centiseconds')
            )
            all_time_lookup = {
                (row['swimmer_id'], row['event_id']): row['best']
                for row in all_time_rows
            }
            # Previous PB: best time set before this meet (same pool), so the
            # stats page can show what each swimmer improved on.
            prev_rows = Result.objects.filter(
                swimmer_id__in=swimmer_ids,
                championship__pool=championship.pool,
                championship__date__lt=championship.date,
                swimmer__is_relay_team=False,
                time_centiseconds__gt=0,
            ).values('swimmer_id', 'event_id').annotate(
                best=Min('time_centiseconds')
            )
            prev_lookup = {
                (row['swimmer_id'], row['event_id']): row['best']
                for row in prev_rows
            }
            # Find which meet bests are also all-time bests
            pb_keys = set()
            for pb in pb_candidates:
                key = (pb['swimmer_id'], pb['event_id'])
                if all_time_lookup.get(key) == pb['meet_best']:
                    pb_keys.add(key)
            if pb_keys:
                # Fetch the actual result rows for PBs
                pb_results = athletes.filter(
                    swimmer__is_relay_team=False, time_centiseconds__gt=0
                ).select_related(
                    'swimmer', 'nationality', 'event'
                ).order_by('swimmer_id', 'event_id', 'time_centiseconds')
                from importer.parsers.base import format_centiseconds
                seen = set()
                for result in pb_results:
                    key = (result.swimmer_id, result.event_id)
                    if key not in pb_keys or key in seen:
                        continue
                    seen.add(key)
                    prev = prev_lookup.get(key)
                    personal_bests.append({
                        'swimmer_id': result.swimmer.id,
                        'swimmer_name': result.swimmer.name,
                        'gender': result.swimmer.sex,
                        'nationality': (result.nationality or result.swimmer.nationality).name if (result.nationality or result.swimmer.nationality) else '',
                        'nationality_code': (result.nationality or result.swimmer.nationality).code if (result.nationality or result.swimmer.nationality) else '',
                        'flag_url': (result.nationality or result.swimmer.nationality).flag_url if (result.nationality or result.swimmer.nationality) else '',
                        'photo': result.swimmer.photo.url if result.swimmer.photo else None,
                        'event_name': result.event.name,
                        'time': result.formatted_time,
                        'fina_points': result.fina_points,
                        'previous_best': format_centiseconds(prev) if prev else None,
                        'improvement_cs': (prev - result.time_centiseconds) if prev else None,
                    })
        personal_bests.sort(key=lambda x: -(x['fina_points'] or 0))

        # Records broken at this meet
        from records.models import Record
        records_broken = []
        meet_records = Record.objects.filter(
            result__championship=championship
        ).select_related('swimmer', 'swimmer__nationality', 'event', 'result__nationality')
        for rec in meet_records:
            rec_nat = (rec.result.nationality if rec.result_id else None) or rec.swimmer.nationality
            records_broken.append({
                'id': rec.id,
                'record_type': rec.record_type,
                'swimmer_id': rec.swimmer.id,
                'swimmer_name': rec.swimmer.name,
                'gender': rec.swimmer.sex,
                'nationality': rec_nat.name if rec_nat else '',
                'nationality_code': rec_nat.code if rec_nat else '',
                'flag_url': rec_nat.flag_url if rec_nat else '',
                'event_name': rec.event.name,
                'time': self._format_time(rec.time_centiseconds),
                'is_new': rec.is_new,
            })

        # Age profile: distribution + youngest/oldest (individual swimmers with a known age)
        from django.db.models import Avg, Max
        age_rows = list(
            athletes.exclude(age_at_competition__isnull=True)
            .values('swimmer_id', 'swimmer__name', 'nationality__code', 'nationality__name')
            .annotate(age=Min('age_at_competition'))
        )
        age_profile = None
        if age_rows:
            counts = {}
            for row in age_rows:
                counts[row['age']] = counts.get(row['age'], 0) + 1

            def _fmt_age(r):
                return {
                    'swimmer_id': r['swimmer_id'], 'swimmer_name': r['swimmer__name'],
                    'nationality_code': r['nationality__code'],
                    'nationality': r['nationality__name'], 'age': r['age'],
                }
            by_age = sorted(age_rows, key=lambda r: (r['age'], r['swimmer__name']))
            age_profile = {
                'average': round(sum(r['age'] for r in age_rows) / len(age_rows), 1),
                'known_count': len(age_rows),
                'distribution': [{'age': a, 'count': c} for a, c in sorted(counts.items())],
                'youngest': [_fmt_age(r) for r in by_age[:3]],
                'oldest': [_fmt_age(r) for r in by_age[::-1][:3]],
            }

        # Busiest swimmers: most races swum at this meet
        busiest = list(
            athletes.values(
                'swimmer_id', 'swimmer__name', 'swimmer__sex',
                'nationality__code', 'nationality__name',
            ).annotate(
                swims=Count('id'),
                events_count=Count('event', distinct=True),
                avg_fina=Avg('fina_points'),
                best_fina=Max('fina_points'),
            ).order_by('-swims', '-avg_fina')[:10]
        )
        busiest_swimmers = [{
            'swimmer_id': b['swimmer_id'],
            'swimmer_name': b['swimmer__name'],
            'gender': b['swimmer__sex'],
            'nationality_code': b['nationality__code'],
            'nationality': b['nationality__name'],
            'swims': b['swims'],
            'events_count': b['events_count'],
            'avg_fina': round(b['avg_fina']) if b['avg_fina'] else None,
            'best_fina': b['best_fina'],
        } for b in busiest]

        return Response({
            'total_results': total_results,
            'total_swimmers': total_swimmers,
            'total_events': total_events,
            'male_count': male_count,
            'female_count': female_count,
            'events': events_list,
            'countries': list(countries),
            'top_performers': top_list,
            'personal_bests': personal_bests[:50],
            'records_broken': records_broken,
            'clubs': clubs,
            'age_profile': age_profile,
            'busiest_swimmers': busiest_swimmers,
        })

    @action(detail=False, methods=['get'], url_path='quick-stats')
    def quick_stats(self, request):
        """Aggregate "Quick Statistics" payload for the home page.

        Defaults to the latest Arab- or GCC-classified meet that has
        results; ?championship=<id> overrides the selection."""
        from django.db.models import Count, Min, Avg, Q
        from medals.models import Medal
        from medals.views import MedalViewSet
        from records.models import Record
        from swimmers.models import Swimmer
        from core.models import Event

        champ_id = request.query_params.get('championship')
        base = Championship.objects.select_related('country', 'classification')
        if champ_id:
            champ = base.filter(pk=champ_id).first()
        else:
            champ = (base.filter(is_published=True, is_calendar_only=False,
                                 classification__name__in=['Arab', 'GCC'],
                                 results__isnull=False)
                     .order_by('-date').first())
        if not champ:
            return Response({'championship': None})

        results = Result.objects.filter(championship=champ)
        athletes = results.filter(swimmer__is_relay_team=False)
        scored = athletes.filter(fina_points__gt=0)

        n_days = 1
        if champ.end_date and champ.end_date >= champ.date:
            n_days = min((champ.end_date - champ.date).days + 1, 30)

        # ---------- medals (relay podium counted once per country) ----------
        medal_qs = MedalViewSet._relay_counts_once(
            Medal.objects.filter(championship=champ, nationality__isnull=False))
        medal_rows = list(medal_qs.values(
            'nationality__name', 'nationality__code', 'nationality__flag_url',
        ).annotate(
            gold=Count('id', filter=Q(medal_type='GOLD')),
            silver=Count('id', filter=Q(medal_type='SILVER')),
            bronze=Count('id', filter=Q(medal_type='BRONZE')),
            total=Count('id'),
        ).order_by('-gold', '-silver', '-bronze'))
        medal_table = [{
            'name': r['nationality__name'], 'code': r['nationality__code'],
            'flag_url': r['nationality__flag_url'],
            'gold': r['gold'], 'silver': r['silver'], 'bronze': r['bronze'], 'total': r['total'],
        } for r in medal_rows]
        medals_total = sum(r['total'] for r in medal_table)

        # ---------- records ----------
        rec_qs = Record.objects.filter(result__championship=champ)
        records_total = rec_qs.count()
        type_labels = dict(Record.RECORD_TYPE_CHOICES)
        records_by_type = [{
            'type': r['record_type'], 'label': type_labels.get(r['record_type'], r['record_type']),
            'count': r['count'],
        } for r in rec_qs.values('record_type').annotate(count=Count('id')).order_by('-count')]
        records_by_country = [{
            'code': r['result__nationality__code'], 'flag_url': r['result__nationality__flag_url'],
            'count': r['count'],
        } for r in rec_qs.filter(result__nationality__isnull=False).values(
            'result__nationality__code', 'result__nationality__flag_url',
        ).annotate(count=Count('id')).order_by('-count')[:6]]
        records_by_day = None
        if n_days > 1:
            day_counts = {}
            for rd in rec_qs.values_list('result_date', flat=True):
                d = (rd - champ.date).days + 1
                if 1 <= d <= n_days:
                    day_counts[d] = day_counts.get(d, 0) + 1
            if len(day_counts) > 1:
                cum, records_by_day = 0, []
                for d in range(1, n_days + 1):
                    cum += day_counts.get(d, 0)
                    records_by_day.append({'day': d, 'cumulative': cum})

        # ---------- participation ----------
        by_country = [{
            'name': r['nationality__name'], 'code': r['nationality__code'],
            'flag_url': r['nationality__flag_url'], 'count': r['count'],
        } for r in athletes.exclude(nationality__isnull=True).values(
            'nationality__name', 'nationality__code', 'nationality__flag_url',
        ).annotate(count=Count('swimmer', distinct=True)).order_by('-count')[:8]]
        # National/Other meets: everyone shares one flag, so the useful
        # breakdown is swimmers per CLUB (Result.team), not per country.
        by_club = None
        cls_name = champ.classification.name if champ.classification else ''
        if cls_name in ('National', 'Other'):
            by_club = [{
                'name': r['team'], 'count': r['count'],
            } for r in athletes.exclude(team__isnull=True).exclude(team='')
                .values('team').annotate(count=Count('swimmer', distinct=True))
                .order_by('-count')[:10]]
        male = athletes.filter(swimmer__sex='M').values('swimmer').distinct().count()
        female = athletes.filter(swimmer__sex='F').values('swimmer').distinct().count()
        age_rows = list(athletes.exclude(age_at_competition__isnull=True)
                        .values('swimmer_id').annotate(age=Min('age_at_competition')))
        age_groups = None
        if age_rows:
            buckets = [('10 & Under', 0, 10), ('11 – 12', 11, 12), ('13 – 14', 13, 14),
                       ('15 – 16', 15, 16), ('17 & Over', 17, 200)]
            age_groups = [{'label': lbl, 'count': sum(1 for r in age_rows if lo <= r['age'] <= hi)}
                          for lbl, lo, hi in buckets]

        # ---------- performance ----------
        def _perf(qs):
            r = qs.select_related('swimmer', 'swimmer__nationality', 'nationality', 'event').order_by('-fina_points').first()
            if not r:
                return None
            nat = r.nationality or r.swimmer.nationality
            return {
                'swimmer_id': r.swimmer_id, 'name': r.swimmer.name,
                'code': nat.code if nat else '', 'flag_url': nat.flag_url if nat else '',
                'photo': r.swimmer.photo.url if r.swimmer.photo else None,
                'event': r.event.name, 'gender': r.swimmer.sex,
                'points': r.fina_points, 'time': r.formatted_time,
            }
        best_overall = _perf(scored)
        best_male = _perf(scored.filter(swimmer__sex='M'))
        best_female = _perf(scored.filter(swimmer__sex='F'))

        top5, seen = [], set()
        for r in scored.select_related('swimmer', 'swimmer__nationality', 'nationality', 'event').order_by('-fina_points')[:300]:
            key = (r.swimmer_id, r.event_id)
            if key in seen:
                continue
            seen.add(key)
            nat = r.nationality or r.swimmer.nationality
            top5.append({
                'swimmer_id': r.swimmer_id, 'name': r.swimmer.name,
                'code': nat.code if nat else '', 'flag_url': nat.flag_url if nat else '',
                'event': r.event.name, 'gender': r.swimmer.sex, 'points': r.fina_points,
            })
            if len(top5) == 5:
                break

        mg = (Medal.objects.filter(championship=champ, medal_type='GOLD', swimmer__is_relay_team=False)
              .values('swimmer_id', 'swimmer__name', 'nationality__code',
                      'nationality__flag_url')
              .annotate(count=Count('id')).order_by('-count').first())
        most_golds = None
        if mg:
            most_golds = {
                'swimmer_id': mg['swimmer_id'], 'name': mg['swimmer__name'],
                'code': mg['nationality__code'] or '',
                'flag_url': mg['nationality__flag_url'] or '', 'count': mg['count'],
            }

        # Personal bests: meet best equals all-time best (same pool)
        pb_total, pb_by_swimmer, best_improvement = 0, {}, None
        pb_candidates = list(athletes.filter(time_centiseconds__gt=0)
                             .values('swimmer_id', 'event_id').annotate(meet_best=Min('time_centiseconds')))
        if pb_candidates:
            swimmer_ids = list({p['swimmer_id'] for p in pb_candidates})
            common = dict(swimmer_id__in=swimmer_ids, championship__pool=champ.pool,
                          swimmer__is_relay_team=False, time_centiseconds__gt=0)
            all_time = {(r['swimmer_id'], r['event_id']): r['best'] for r in Result.objects.filter(
                **common).values('swimmer_id', 'event_id').annotate(best=Min('time_centiseconds'))}
            prev = {(r['swimmer_id'], r['event_id']): r['best'] for r in Result.objects.filter(
                championship__date__lt=champ.date, **common
            ).values('swimmer_id', 'event_id').annotate(best=Min('time_centiseconds'))}
            for p in pb_candidates:
                key = (p['swimmer_id'], p['event_id'])
                if all_time.get(key) == p['meet_best']:
                    pb_total += 1
                    pb_by_swimmer[p['swimmer_id']] = pb_by_swimmer.get(p['swimmer_id'], 0) + 1
                    pv = prev.get(key)
                    if pv and pv > p['meet_best']:
                        imp = pv - p['meet_best']
                        if best_improvement is None or imp > best_improvement[0]:
                            best_improvement = (imp, key)

        most_pbs = None
        if pb_by_swimmer:
            top_count = max(pb_by_swimmer.values())
            leaders = [sid for sid, c in pb_by_swimmer.items() if c == top_count]
            if len(leaders) == 1:
                sw = Swimmer.objects.select_related('nationality').filter(pk=leaders[0]).first()
                most_pbs = {'count': top_count, 'name': sw.name if sw else '',
                            'code': sw.nationality.code if sw and sw.nationality else '',
                            'swimmer_id': leaders[0]}
            else:
                most_pbs = {'count': top_count, 'name': 'Multiple Swimmers', 'code': '', 'swimmer_id': None}

        biggest_improvement = None
        if best_improvement:
            imp, (sid, eid) = best_improvement
            sw = Swimmer.objects.select_related('nationality').filter(pk=sid).first()
            ev = Event.objects.filter(pk=eid).first()
            biggest_improvement = {
                'swimmer_id': sid, 'name': sw.name if sw else '',
                'code': sw.nationality.code if sw and sw.nationality else '',
                'gender': sw.sex if sw else '', 'event': ev.name if ev else '',
                'seconds': round(imp / 100.0, 2),
            }

        # Average points per day via the meet program (event -> day)
        points_by_day = None
        prog = list(ProgramItem.objects.filter(championship=champ).values('event_id', 'day', 'session'))
        if prog and n_days > 1:
            day_of_event = {}
            for it in prog:
                if it['event_id'] not in day_of_event or it['session'] == 'FINALS':
                    day_of_event[it['event_id']] = it['day']
            sums, cnts = {}, {}
            for r in scored.values('event_id').annotate(avg=Avg('fina_points'), n=Count('id')):
                d = day_of_event.get(r['event_id'])
                if d:
                    sums[d] = sums.get(d, 0) + r['avg'] * r['n']
                    cnts[d] = cnts.get(d, 0) + r['n']
            if len(cnts) > 1:
                points_by_day = [{'day': d, 'avg': round(sums[d] / cnts[d])} for d in sorted(cnts)]

        # ---------- progress ----------
        events_done = results.values('event').distinct().count()
        prog_events = len({it['event_id'] for it in prog}) if prog else 0
        events_total = max(events_done, prog_events)
        finals_done = results.filter(round_type__in=['Finals', 'Consolation', '']).values('event').distinct().count()
        heats_done = results.filter(round_type__in=['Heats', 'Prelims']).values('event').distinct().count()

        country = champ.country
        return Response({
            'championship': {
                'id': champ.id, 'name': champ.name,
                'date': str(champ.date), 'end_date': str(champ.end_date) if champ.end_date else None,
                'location': champ.location,
                'country_name': country.name if country else '',
                'country_code': country.code if country else '',
                'flag_url': country.flag_url if country else '',
                'pool': champ.pool,
                'classification': champ.classification.name if champ.classification else '',
            },
            'counts': {
                'countries': athletes.exclude(nationality__isnull=True)
                                     .values('nationality').distinct().count(),
                'swimmers': male + female,
                # National-team meets (e.g. GCC Games) carry no club names —
                # each delegation is a team, so fall back to the country count.
                'clubs': athletes.exclude(team='').values('team').distinct().count()
                         or athletes.exclude(nationality__isnull=True)
                                    .values('nationality').distinct().count(),
                'events': events_done,
                'results': results.count(),
                'medals': medals_total,
                'records': records_total,
                'personal_bests': pb_total,
            },
            'participation': {
                'by_country': by_country, 'by_club': by_club,
                'male': male, 'female': female, 'age_groups': age_groups,
            },
            'medals': {'table': medal_table, 'total': medals_total},
            'performance': {
                'best_overall': best_overall, 'best_male': best_male, 'best_female': best_female,
                'most_golds': most_golds, 'most_pbs': most_pbs,
                'biggest_improvement': biggest_improvement,
                'top5': top5, 'points_by_day': points_by_day,
            },
            'records': {
                'total': records_total, 'by_type': records_by_type,
                'by_day': records_by_day, 'by_country': records_by_country,
            },
            'progress': {
                'percent': round(100 * events_done / events_total) if events_total else 0,
                'events_completed': events_done, 'events_total': events_total,
                'finals_completed': finals_done, 'heats_completed': heats_done,
                'records_broken': records_total, 'medals_awarded': medals_total,
            },
        })

    @action(detail=True, methods=['get'], url_path='most-improved')
    def most_improved(self, request, pk=None):
        """Swimmers who improved the most vs their previous personal best."""
        from django.db.models import Min
        championship = self.get_object()

        # Get best time per swimmer+event at this championship (individuals only)
        current = (
            championship.results
            .filter(swimmer__is_relay_team=False, is_hc=False)
            .values('swimmer_id', 'event_id')
            .annotate(best_time=Min('time_centiseconds'))
        )

        improvements = []
        # Batch-fetch swimmer and event info
        swimmer_ids = set()
        event_ids = set()
        for row in current:
            swimmer_ids.add(row['swimmer_id'])
            event_ids.add(row['event_id'])

        from swimmers.models import Swimmer
        from core.models import Event
        swimmers = {s.id: s for s in Swimmer.objects.filter(id__in=swimmer_ids).select_related('nationality')}
        events = {e.id: e for e in Event.objects.filter(id__in=event_ids)}

        for row in current:
            sid, eid, current_time = row['swimmer_id'], row['event_id'], row['best_time']
            # Previous best: same swimmer, same event, same pool, earlier date
            prev_result = (
                Result.objects.filter(
                    swimmer_id=sid, event_id=eid,
                    championship__pool=championship.pool,
                    championship__date__lt=championship.date,
                    swimmer__is_relay_team=False,
                    is_hc=False,
                )
                .select_related('championship')
                .order_by('time_centiseconds')
                .first()
            )
            swimmer = swimmers.get(sid)
            event = events.get(eid)
            if not swimmer or not event:
                continue

            if prev_result is None:
                # First time in this event — include as new entry
                improvements.append({
                    'swimmer_id': sid,
                    'swimmer_name': swimmer.name,
                    'gender': swimmer.sex,
                    'nationality': swimmer.nationality.name if swimmer.nationality else '',
                    'nationality_code': swimmer.nationality.code if swimmer.nationality else '',
                    'flag_url': swimmer.nationality.flag_url if swimmer.nationality else '',
                    'photo': swimmer.photo.url if swimmer.photo else None,
                    'event_name': event.name,
                    'current_time': self._format_time(current_time),
                    'previous_best': None,
                    'previous_best_meet': None,
                    'previous_best_meet_id': None,
                    'previous_best_date': None,
                    'improvement_cs': 0,
                    'improvement': None,
                    'is_new_entry': True,
                })
                continue
            if prev_result.time_centiseconds <= current_time:
                continue  # no improvement
            prev = prev_result.time_centiseconds
            improvement_cs = prev - current_time
            improvements.append({
                'swimmer_id': sid,
                'swimmer_name': swimmer.name,
                'gender': swimmer.sex,
                'nationality': swimmer.nationality.name if swimmer.nationality else '',
                'nationality_code': swimmer.nationality.code if swimmer.nationality else '',
                'flag_url': swimmer.nationality.flag_url if swimmer.nationality else '',
                'photo': swimmer.photo.url if swimmer.photo else None,
                'event_name': event.name,
                'current_time': self._format_time(current_time),
                'previous_best': self._format_time(prev),
                'previous_best_meet': prev_result.championship.name,
                'previous_best_meet_id': prev_result.championship.id,
                'previous_best_date': prev_result.championship.date,
                'improvement_cs': improvement_cs,
                'improvement': self._format_time(improvement_cs),
                'is_new_entry': False,
            })

        # Improved swimmers first (sorted by biggest improvement), then new entries
        improved = [x for x in improvements if not x.get('is_new_entry')]
        new_entries = [x for x in improvements if x.get('is_new_entry')]
        improved.sort(key=lambda x: -x['improvement_cs'])
        return Response(improved[:30] + new_entries[:20])

    @action(detail=True, methods=['get'], url_path='compare')
    def compare(self, request, pk=None):
        """Compare this championship with previous editions (same classification)."""
        from django.db.models import Count, Min
        championship = self.get_object()

        # Find related championships: same classification + same pool
        filters = {'pool': championship.pool}
        if championship.sub_classification_id:
            filters['sub_classification_id'] = championship.sub_classification_id
        elif championship.classification_id:
            filters['classification_id'] = championship.classification_id
        else:
            # No classification — can't compare
            return Response([])

        related = (
            Championship.objects
            .filter(**filters)
            .exclude(id=championship.id)
            .order_by('-date')[:10]
        )

        comparisons = []
        for champ in related:
            athletes = champ.results.filter(swimmer__is_relay_team=False)
            total_results = champ.results.count()
            total_swimmers = athletes.values('swimmer').distinct().count()
            countries_count = athletes.values('nationality').distinct().count()
            total_events = champ.results.values('event').distinct().count()

            # Best FINA points at this championship
            best_fina = athletes.filter(
                fina_points__isnull=False, fina_points__gt=0
            ).order_by('-fina_points').values_list('fina_points', flat=True).first()

            comparisons.append({
                'id': champ.id,
                'name': champ.name,
                'date': champ.date.strftime('%d/%m/%Y'),
                'year': champ.date.year,
                'pool': champ.pool,
                'country': champ.country.name if champ.country else '',
                'country_code': champ.country.code if champ.country else '',
                'flag_url': champ.country.flag_url if champ.country else '',
                'total_results': total_results,
                'total_swimmers': total_swimmers,
                'countries_count': countries_count,
                'total_events': total_events,
                'best_fina': best_fina,
            })

        # Add current championship for comparison
        athletes = championship.results.filter(swimmer__is_relay_team=False)
        best_fina = athletes.filter(
            fina_points__isnull=False, fina_points__gt=0
        ).order_by('-fina_points').values_list('fina_points', flat=True).first()

        current = {
            'id': championship.id,
            'name': championship.name,
            'date': championship.date.strftime('%d/%m/%Y'),
            'year': championship.date.year,
            'pool': championship.pool,
            'country': championship.country.name if championship.country else '',
            'country_code': championship.country.code if championship.country else '',
            'flag_url': championship.country.flag_url if championship.country else '',
            'total_results': championship.results.count(),
            'total_swimmers': athletes.values('swimmer').distinct().count(),
            'countries_count': athletes.values('nationality').distinct().count(),
            'total_events': championship.results.values('event').distinct().count(),
            'best_fina': best_fina,
            'is_current': True,
        }

        # Sort all by date descending, current first
        all_champs = [current] + comparisons
        all_champs.sort(key=lambda x: x['date'], reverse=True)

        return Response(all_champs)

    @action(detail=True, methods=['get'], url_path='head-to-head')
    def head_to_head(self, request, pk=None):
        """Side-by-side comparison of two meets. Only meets sharing the same
        pool type are comparable (times mean different things in LCM vs SCM)."""
        from django.db.models import Min, Avg
        from medals.models import Medal
        from records.models import Record

        championship = self.get_object()
        other_id = request.query_params.get('other')
        other = (Championship.objects.select_related('country', 'classification')
                 .filter(pk=other_id).first()) if other_id else None
        if not other:
            return Response({'detail': 'Pick a meet to compare with.'}, status=400)
        if other.pool != championship.pool:
            return Response(
                {'detail': 'Both meets must use the same pool type (LCM with LCM, SCM with SCM).'},
                status=400)

        def summary(champ):
            results = Result.objects.filter(championship=champ, time_centiseconds__gt=0)
            athletes = results.filter(swimmer__is_relay_team=False)
            male = athletes.filter(swimmer__sex='M').values('swimmer').distinct().count()
            female = athletes.filter(swimmer__sex='F').values('swimmer').distinct().count()
            best = (athletes.filter(fina_points__gt=0)
                    .select_related('swimmer', 'event').order_by('-fina_points').first())
            avg_age = athletes.exclude(age_at_competition__isnull=True).aggregate(
                a=Avg('age_at_competition'))['a']
            return {
                'id': champ.id, 'name': champ.name,
                'date': str(champ.date),
                'end_date': str(champ.end_date) if champ.end_date else None,
                'year': champ.date.year, 'pool': champ.pool,
                'classification': champ.classification.name if champ.classification else '',
                'country': champ.country.name if champ.country else '',
                'country_code': champ.country.code if champ.country else '',
                'flag_url': champ.country.flag_url if champ.country else '',
                'swimmers': male + female, 'male': male, 'female': female,
                'countries': athletes.exclude(nationality__isnull=True)
                                     .values('nationality').distinct().count(),
                'clubs': athletes.exclude(team='').values('team').distinct().count(),
                'events': results.values('event').distinct().count(),
                'results': results.count(),
                'medals': Medal.objects.filter(championship=champ).count(),
                'records_broken': Record.objects.filter(result__championship=champ).count(),
                'avg_age': round(avg_age, 1) if avg_age else None,
                'best_fina': best.fina_points if best else None,
                'best_fina_swimmer': best.swimmer.name if best else None,
                'best_fina_event': best.event.name if best else None,
            }

        def winners(champ):
            rows = (Result.objects
                    .filter(championship=champ, time_centiseconds__gt=0, is_hc=False)
                    .values('event_id', 'event__name', 'event__sort_order', 'swimmer__sex')
                    .annotate(best=Min('time_centiseconds')))
            return {(r['event_id'], r['swimmer__sex']): r for r in rows}

        wa, wb = winners(championship), winners(other)
        events = []
        for key in wa.keys() & wb.keys():
            ra, rb = wa[key], wb[key]
            na = (Result.objects.filter(championship=championship, event_id=key[0],
                                        swimmer__sex=key[1], time_centiseconds=ra['best'])
                  .select_related('swimmer').first())
            nb = (Result.objects.filter(championship=other, event_id=key[0],
                                        swimmer__sex=key[1], time_centiseconds=rb['best'])
                  .select_related('swimmer').first())
            events.append({
                'event_id': key[0], 'event': ra['event__name'], 'gender': key[1],
                'sort': ra.get('event__sort_order') or 0,
                'a_time': self._format_time(ra['best']), 'a_cs': ra['best'],
                'a_swimmer': na.swimmer.name if na else '',
                'a_swimmer_id': na.swimmer_id if na else None,
                'a_is_relay': bool(na and na.swimmer.is_relay_team),
                'b_time': self._format_time(rb['best']), 'b_cs': rb['best'],
                'b_swimmer': nb.swimmer.name if nb else '',
                'b_swimmer_id': nb.swimmer_id if nb else None,
                'b_is_relay': bool(nb and nb.swimmer.is_relay_team),
                'diff_seconds': round((ra['best'] - rb['best']) / 100, 2),
            })
        events.sort(key=lambda e: (e['gender'], e['sort'], e['event']))

        return Response({'a': summary(championship), 'b': summary(other), 'events': events})

    @staticmethod
    def _format_time(cs):
        if not cs:
            return ''
        minutes = cs // 6000
        seconds = (cs % 6000) // 100
        centis = cs % 100
        if minutes:
            return f'{minutes}:{seconds:02d}.{centis:02d}'
        return f'{seconds}.{centis:02d}'

    @action(detail=True, methods=['get'], url_path='results-by-swimmer')
    def results_by_swimmer(self, request, pk=None):
        """List swimmers in this championship with result counts and nationality."""
        from django.db.models import Count
        championship = self.get_object()
        rows = (
            championship.results
            .filter(swimmer__is_relay_team=False)
            .values(
                'swimmer_id', 'swimmer__name', 'swimmer__sex',
                'nationality__code', 'nationality__name',
                'nationality__region',
            )
            .annotate(results_count=Count('id'))
            .order_by('nationality__region', 'swimmer__name')
        )
        data = []
        for r in rows:
            data.append({
                'swimmer_id': r['swimmer_id'],
                'name': r['swimmer__name'],
                'sex': r['swimmer__sex'],
                'nationality_code': r['nationality__code'],
                'nationality': r['nationality__name'],
                'region': r['nationality__region'],
                'results_count': r['results_count'],
                'is_arab': r['nationality__region'] in ('ARAB', 'GCC'),
            })
        return Response(data)

    @action(detail=True, methods=['get'], url_path='records-broken')
    def records_broken(self, request, pk=None):
        """Records broken during this meet, computed from existing data.

        For every scope (arab / gcc / national per country), compare the
        fastest swim of the meet per event+gender against the best time
        recorded before the meet (same pool, OPEN age). A record is
        "broken" only when a strictly faster swim beats an existing
        pre-meet best — first-ever times are not listed. When several
        swimmers beat the old record, the fastest (the record at meet
        end) is shown.
        """
        from django.db.models import Min
        championship = self.get_object()
        pool = championship.pool

        meet_rows = list(
            championship.results
            .filter(is_hc=False, time_centiseconds__gt=0,
                    nationality__isnull=False)
            .select_related('swimmer', 'swimmer__nationality', 'nationality', 'event')
        )
        if not meet_rows:
            return Response([])

        def gender_key(r):
            # Mixed relays carry one placeholder swimmer whose sex is
            # arbitrary — group them under 'X' via the event name.
            if r.event.is_relay and 'mixed' in r.event.name.lower():
                return 'X'
            return r.swimmer.sex

        # Best swim of the meet per (scope-eligible group, event, gender)
        event_ids = {r.event_id for r in meet_rows}

        prev = Result.objects.filter(
            championship__pool=pool, is_hc=False, time_centiseconds__gt=0,
            championship__date__lt=championship.date,
            event_id__in=event_ids,
            nationality__region__in=['ARAB', 'GCC'],
        ).exclude(championship=championship)

        # Pre-meet bests per scope
        def best_map(qs, extra=()):
            rows = qs.values('event_id', 'swimmer__sex', *extra).annotate(
                best=Min('time_centiseconds'))
            return {tuple(r[k] for k in ('event_id', 'swimmer__sex', *extra)): r['best']
                    for r in rows}

        arab_best = best_map(prev)
        gcc_best = best_map(prev.filter(nationality__region='GCC'))
        national_best = best_map(prev, extra=('nationality_id',))

        # Meet's best breaking swim per (scope, event, gender)
        best_break = {}
        for r in meet_rows:
            region = (r.nationality or r.swimmer.nationality).region
            g = gender_key(r)
            sexes = ('M', 'F') if g == 'X' else (g,)

            def check(scope, table, key_extra=()):
                # A mixed relay competes against pre-meet bests of either
                # sex grouping (older data may store either placeholder sex)
                prevs = [table.get((r.event_id, s, *key_extra)) for s in sexes]
                prevs = [p for p in prevs if p is not None]
                if not prevs:
                    return
                old = min(prevs)
                if r.time_centiseconds >= old:
                    return
                k = (scope, r.event_id, g, *key_extra)
                cur = best_break.get(k)
                if cur is None or r.time_centiseconds < cur[0].time_centiseconds:
                    best_break[k] = (r, old)

            if region in ('ARAB', 'GCC'):
                check('arab', arab_best)
                if region == 'GCC':
                    check('gcc', gcc_best)
            check('national', national_best,
                  key_extra=(r.nationality_id or r.swimmer.nationality_id,))

        # Resolve previous holders and build the payload
        def fmt(cs):
            m, s, c = cs // 6000, (cs % 6000) // 100, cs % 100
            return f'{m}:{s:02d}.{c:02d}' if m else f'{s}.{c:02d}'

        out = []
        for (scope, event_id, g, *extra), (r, old) in best_break.items():
            holder_qs = prev.filter(event_id=event_id, time_centiseconds=old)
            if g != 'X':
                holder_qs = holder_qs.filter(swimmer__sex=g)
            if scope == 'gcc':
                holder_qs = holder_qs.filter(nationality__region='GCC')
            elif scope == 'national':
                holder_qs = holder_qs.filter(nationality_id=extra[0])
            holder = (holder_qs.select_related('swimmer', 'swimmer__nationality', 'nationality', 'championship')
                      .order_by('championship__date').first())
            nat = r.nationality or r.swimmer.nationality
            out.append({
                'scope': scope,
                'country': nat.name if scope == 'national' else '',
                'country_code': nat.code if scope == 'national' else '',
                'event_id': event_id,
                'event_name': r.event.name,
                'event_sort_order': r.event.sort_order,
                'event_distance': r.event.distance,
                'is_relay': r.event.is_relay,
                'gender': g,
                'swimmer_id': r.swimmer_id,
                'swimmer_name': r.swimmer.name,
                'is_relay_team': r.swimmer.is_relay_team,
                'nationality_code': nat.code,
                'nationality_flag': nat.flag_url,
                'time': fmt(r.time_centiseconds),
                'time_centiseconds': r.time_centiseconds,
                'previous_time': fmt(old),
                'previous_time_centiseconds': old,
                'previous_holder': holder.swimmer.name if holder else '',
                'previous_holder_id': holder.swimmer_id if holder else None,
                'previous_meet': holder.championship.name if holder else '',
                'previous_date': holder.championship.date.isoformat() if holder else '',
                'improvement_centiseconds': old - r.time_centiseconds,
            })

        scope_order = {'arab': 0, 'gcc': 1, 'national': 2}
        out.sort(key=lambda x: (scope_order[x['scope']], x['country'],
                                x['gender'], x['event_sort_order'], x['event_distance']))
        return Response(out)

    @action(detail=True, methods=['post'], url_path='recompute-medals')
    def recompute_medals_action(self, request, pk=None):
        """Re-run country fixes and medal awarding for this championship.
        Lets admins apply importer post-processing fixes to meets that were
        imported before the fix existed."""
        championship = self.get_object()
        from teams.utils import apply_subclassification_country
        from medals.utils import recompute_medals
        from .categories import infer_blank_categories
        teams_updated = apply_subclassification_country(championship)
        categories_inferred = infer_blank_categories(championship)
        medal_count = recompute_medals(championship)
        return Response({'medals': medal_count, 'teams_updated': teams_updated,
                         'categories_inferred': categories_inferred})

    @action(detail=True, methods=['post'], url_path='bulk-delete-results')
    def bulk_delete_results(self, request, pk=None):
        """Delete all results for given swimmer_ids in this championship."""
        championship = self.get_object()
        swimmer_ids = request.data.get('swimmer_ids', [])
        if not swimmer_ids:
            return Response({'error': 'swimmer_ids required'}, status=400)
        qs = championship.results.filter(swimmer_id__in=swimmer_ids)
        count = qs.count()
        # Medal.result is SET_NULL: deleting results would orphan their
        # medals into "manual" ones that recompute can never remove (and
        # that block re-awarding to the same swimmer/event).
        from medals.models import Medal
        Medal.objects.filter(result__in=qs).delete()
        qs.delete()
        # Recompute medals after cleanup
        from medals.utils import recompute_medals
        recompute_medals(championship)
        # Clean up orphan swimmers
        from swimmers.models import Swimmer
        orphans = Swimmer.objects.filter(
            id__in=swimmer_ids,
            results__isnull=True,
            medals__isnull=True,
            records__isnull=True,
            hall_of_fame_entries__isnull=True,
        )
        orphans_deleted = orphans.count()
        orphans.delete()
        # Clubs whose swimmers were all removed must not linger as teams
        from teams.utils import cleanup_orphan_teams
        teams_deleted = cleanup_orphan_teams()
        return Response({
            'deleted_results': count,
            'deleted_orphan_swimmers': orphans_deleted,
            'deleted_orphan_teams': teams_deleted,
        })

    @action(detail=True, methods=['post'], url_path='bulk-delete-result-ids')
    def bulk_delete_result_ids(self, request, pk=None):
        """Delete specific results by their IDs."""
        championship = self.get_object()
        result_ids = request.data.get('result_ids', [])
        if not result_ids:
            return Response({'error': 'result_ids required'}, status=400)
        qs = championship.results.filter(id__in=result_ids)
        # Gather swimmer ids before deleting so we can check for orphans
        swimmer_ids = list(qs.values_list('swimmer_id', flat=True).distinct())
        count = qs.count()
        # See bulk_delete_results: never orphan medals into manual ones.
        from medals.models import Medal
        Medal.objects.filter(result__in=qs).delete()
        qs.delete()
        from medals.utils import recompute_medals
        recompute_medals(championship)
        from swimmers.models import Swimmer
        orphans = Swimmer.objects.filter(
            id__in=swimmer_ids,
            results__isnull=True,
            medals__isnull=True,
            records__isnull=True,
            hall_of_fame_entries__isnull=True,
        )
        orphans_deleted = orphans.count()
        orphans.delete()
        from teams.utils import cleanup_orphan_teams
        teams_deleted = cleanup_orphan_teams()
        return Response({
            'deleted_results': count,
            'deleted_orphan_swimmers': orphans_deleted,
            'deleted_orphan_teams': teams_deleted,
        })

    @action(detail=True, methods=['get'], url_path='all-results')
    def all_results(self, request, pk=None):
        """All results for this championship, grouped by event+gender+round."""
        from importer.parsers.base import format_centiseconds
        championship = self.get_object()
        results = championship.results.select_related(
            'swimmer', 'nationality', 'event'
        ).order_by('event__sort_order', 'event__distance', 'swimmer__sex', 'round_type', 'time_centiseconds')
        groups = {}
        for r in results:
            gender = r.swimmer.sex if r.swimmer else 'M'
            gender_label = {'M': 'Men', 'F': 'Women', 'X': 'Mixed'}.get(gender, gender)
            key = (r.event_id, gender, r.round_type or '')
            if key not in groups:
                round_label = r.round_type or 'Timed Finals'
                groups[key] = {
                    'event_id': r.event_id,
                    'event_name': r.event.name,
                    'gender': gender,
                    'gender_label': gender_label,
                    'round_type': r.round_type or '',
                    'round_label': round_label,
                    'label': f"{r.event.name} — {gender_label}" + (f" ({round_label})" if r.round_type else ''),
                    'results': [],
                }
            groups[key]['results'].append({
                'id': r.id,
                'swimmer_id': r.swimmer_id,
                'swimmer_name': r.swimmer.name if r.swimmer else '',
                'nationality_code': (r.nationality or r.swimmer.nationality).code if r.swimmer and (r.nationality or r.swimmer.nationality) else '',
                'nationality_name': (r.nationality or r.swimmer.nationality).name if r.swimmer and (r.nationality or r.swimmer.nationality) else '',
                'flag_url': (r.nationality or r.swimmer.nationality).flag_url if r.swimmer and (r.nationality or r.swimmer.nationality) else '',
                'team': r.team or '',
                'time': format_centiseconds(r.time_centiseconds),
                'time_centiseconds': r.time_centiseconds,
                'fina_points': r.fina_points,
                'category': r.category or '',
                'is_relay': r.swimmer.is_relay_team if r.swimmer else False,
                'splits': r.splits or [],
            })
        return Response(list(groups.values()))


class ResultViewSet(viewsets.ModelViewSet):
    queryset = Result.objects.select_related('swimmer', 'swimmer__nationality', 'nationality', 'championship', 'event')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ResultCreateSerializer
        return ResultSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        swimmer = self.request.query_params.get('swimmer')
        championship = self.request.query_params.get('championship')
        event = self.request.query_params.get('event')
        if swimmer:
            qs = qs.filter(swimmer_id=swimmer)
        if championship:
            qs = qs.filter(championship_id=championship)
        if event:
            qs = qs.filter(event_id=event)
        return qs

    def perform_create(self, serializer):
        result = serializer.save()
        self._auto_fina(result)
        self._recompute(result.championship)

    def perform_update(self, serializer):
        result = serializer.save()
        self._auto_fina(result)
        self._recompute(result.championship)

    @staticmethod
    def _auto_fina(result):
        """Calculate and save FINA points if not already set."""
        if result.time_centiseconds and result.time_centiseconds > 0:
            from importer.points import calculate_points
            gender = result.swimmer.sex if result.swimmer else 'M'
            pool = result.championship.pool if result.championship else 'LCM'
            pts = calculate_points(
                result.time_centiseconds,
                result.event.name,
                gender,
                pool,
            )
            if pts and pts > 0:
                result.fina_points = pts
                result.save(update_fields=['fina_points'])

    def perform_destroy(self, instance):
        championship = instance.championship
        instance.delete()
        self._recompute(championship)

    @staticmethod
    def _recompute(championship):
        from medals.utils import recompute_medals
        recompute_medals(championship)
