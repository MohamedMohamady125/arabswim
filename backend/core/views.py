from rest_framework import viewsets, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.core.mail import send_mail
from django.conf import settings as django_settings
from .models import Country, Event, ProfileClaim, PhotoRequest, SiteFeature
from .permissions import IsAdmin, is_admin
from .serializers import (
    UserSerializer, CountrySerializer, EventSerializer,
    RegisterSerializer, ProfileClaimSerializer,
)

User = get_user_model()


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }, status=201)


@api_view(['POST'])
@permission_classes([IsAdmin])
def create_org_account(request):
    """Admin creates a CLUB or FEDERATION account for an org's email.
    The generated password is returned exactly once."""
    kind = str(request.data.get('kind', '')).upper()
    email = str(request.data.get('email', '')).strip().lower()
    if kind not in ('CLUB', 'FEDERATION'):
        return Response({'error': 'kind must be CLUB or FEDERATION'}, status=400)
    if not email or '@' not in email:
        return Response({'error': 'A valid email is required'}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({'error': 'An account with this email already exists'}, status=400)

    team = country = None
    if kind == 'CLUB':
        from teams.models import Team
        team = Team.objects.filter(pk=request.data.get('team')).first()
        if not team:
            return Response({'error': 'A valid team is required for a club account'}, status=400)
        if team.accounts.exists():
            return Response({'error': 'This club already has an account'}, status=400)
    else:
        country = Country.objects.filter(pk=request.data.get('country')).first()
        if not country:
            return Response({'error': 'A valid country is required for a federation account'}, status=400)
        if country.federation_accounts.exists():
            return Response({'error': 'This federation already has an account'}, status=400)

    base = email.split('@')[0][:24] or kind.lower()
    username = base
    suffix = 1
    while User.objects.filter(username=username).exists():
        suffix += 1
        username = f'{base}{suffix}'

    password = get_random_string(14)
    user = User.objects.create_user(
        username=username, email=email, password=password,
        role=kind, team=team, country=country,
    )
    data = UserSerializer(user).data
    data['password'] = password
    return Response(data, status=201)


# Site sections the admin can hide until they're ready to launch
FEATURE_KEYS = [
    'hall_of_fame', 'coaches', 'news', 'marketplace', 'media',
    'records', 'new_records', 'medals', 'rankings', 'qualifying_times',
    'predictions', 'calendar', 'live', 'compare', 'teams', 'swimmers',
]


@api_view(['GET', 'PATCH'])
@permission_classes([permissions.AllowAny])
def site_features(request):
    """GET: public map of section toggles. PATCH (admin): update toggles."""
    if request.method == 'PATCH':
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        for key in FEATURE_KEYS:
            if key in request.data:
                SiteFeature.objects.update_or_create(
                    key=key, defaults={'enabled': bool(request.data[key])}
                )
    stored = dict(SiteFeature.objects.filter(key__in=FEATURE_KEYS).values_list('key', 'enabled'))
    return Response({key: stored.get(key, True) for key in FEATURE_KEYS})


class ProfileClaimViewSet(viewsets.ModelViewSet):
    queryset = ProfileClaim.objects.select_related('user', 'swimmer')
    serializer_class = ProfileClaimSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action in ('create', 'mine'):
            return [permissions.IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs

    def create(self, request, *args, **kwargs):
        user = request.user
        if user.swimmer_id:
            return Response({'error': 'Your account is already linked to a swimmer profile'}, status=400)
        if user.claims.filter(status='PENDING').exists():
            return Response({'error': 'You already have a claim pending review'}, status=400)
        # Resubmit: a declined claim on the same swimmer can be retried
        if user.claims.filter(status='APPROVED').exists():
            return Response({'error': 'You already have an approved claim'}, status=400)

        from swimmers.models import Swimmer
        swimmer = Swimmer.objects.filter(pk=request.data.get('swimmer')).first()
        if not swimmer or swimmer.is_relay_team:
            return Response({'error': 'A valid swimmer is required'}, status=400)
        if hasattr(swimmer, 'account') and swimmer.account:
            return Response({'error': 'This swimmer profile has already been claimed'}, status=400)

        document = request.FILES.get('id_document')
        from core.uploads import validate_image
        err = validate_image(document)
        if err:
            return Response({'error': err}, status=400)

        claim = ProfileClaim.objects.create(user=user, swimmer=swimmer, id_document=document)
        return Response(ProfileClaimSerializer(claim, context={'request': request}).data, status=201)

    @action(detail=False, methods=['get'])
    def mine(self, request):
        claims = self.get_queryset().filter(user=request.user)
        return Response(ProfileClaimSerializer(claims, many=True, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        claim = self.get_object()
        if claim.status != 'PENDING':
            return Response({'error': 'This claim has already been reviewed'}, status=400)
        if hasattr(claim.swimmer, 'account') and claim.swimmer.account:
            return Response({'error': 'This swimmer profile has already been claimed'}, status=400)
        claim.user.role = 'ATHLETE'
        claim.user.swimmer = claim.swimmer
        claim.user.save(update_fields=['role', 'swimmer'])
        claim.status = 'APPROVED'
        claim.reviewed_at = timezone.now()
        claim.reviewed_by = request.user
        claim.save(update_fields=['status', 'reviewed_at', 'reviewed_by'])
        # Auto-decline other pending claims on the same swimmer
        ProfileClaim.objects.filter(swimmer=claim.swimmer, status='PENDING').exclude(pk=claim.pk).update(
            status='DECLINED', note='Profile was claimed by another verified account',
            reviewed_at=timezone.now(), reviewed_by=request.user,
        )
        _send_claim_email(claim, approved=True)
        return Response(ProfileClaimSerializer(claim, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        claim = self.get_object()
        if claim.status != 'PENDING':
            return Response({'error': 'This claim has already been reviewed'}, status=400)
        claim.status = 'DECLINED'
        claim.note = str(request.data.get('note', '') or '')
        claim.reviewed_at = timezone.now()
        claim.reviewed_by = request.user
        claim.save(update_fields=['status', 'note', 'reviewed_at', 'reviewed_by'])
        _send_claim_email(claim, approved=False)
        return Response(ProfileClaimSerializer(claim, context={'request': request}).data)


def _send_claim_email(claim, approved):
    """Send an email notification when a profile claim is approved or declined."""
    import logging
    logger = logging.getLogger(__name__)
    email = claim.user.email
    if not email:
        return
    swimmer_name = claim.swimmer.name
    base = django_settings.FRONTEND_URL
    profile_url = f'{base}/swimmers/{claim.swimmer_id}'
    if approved:
        subject = f'Your profile claim for {swimmer_name} has been approved'
        body = (
            f'Hi {claim.user.first_name or claim.user.username},\n\n'
            f'Your claim on the swimmer profile "{swimmer_name}" has been approved. '
            f'Your account is now verified as an athlete on Arab Swim.\n\n'
            f'You can view and edit your profile at:\n'
            f'{profile_url}\n\n'
            f'— Arab Swim'
        )
    else:
        subject = f'Your profile claim for {swimmer_name} was declined'
        reason = claim.note or 'No specific reason provided.'
        body = (
            f'Hi {claim.user.first_name or claim.user.username},\n\n'
            f'Your claim on the swimmer profile "{swimmer_name}" was declined.\n\n'
            f'Reason: {reason}\n\n'
            f'You can submit a new claim with a clearer ID document at:\n'
            f'{profile_url}\n\n'
            f'— Arab Swim'
        )
    try:
        send_mail(subject, body, django_settings.DEFAULT_FROM_EMAIL, [email])
        logger.info('Claim %s email sent to %s (claim #%s)', 'approval' if approved else 'decline', email, claim.pk)
    except Exception:
        logger.warning('Failed to send claim email to %s (claim #%s)', email, claim.pk, exc_info=True)


class PhotoRequestViewSet(viewsets.ModelViewSet):
    """Athletes submit profile photo changes; admin approves/rejects in bulk."""
    queryset = PhotoRequest.objects.select_related('swimmer', 'user')
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action in ('create',):
            return [permissions.IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs

    def create(self, request, *args, **kwargs):
        user = request.user
        if not user.swimmer_id:
            return Response({'error': 'You must claim a profile first'}, status=400)
        photo = request.FILES.get('photo')
        if not photo:
            return Response({'error': 'No photo provided'}, status=400)
        from core.uploads import validate_image
        err = validate_image(photo)
        if err:
            return Response({'error': err}, status=400)
        # Cancel any existing pending request
        PhotoRequest.objects.filter(swimmer_id=user.swimmer_id, status='PENDING').update(status='DECLINED')
        pr = PhotoRequest.objects.create(swimmer_id=user.swimmer_id, user=user, photo=photo)
        return Response({
            'id': pr.id, 'status': 'PENDING',
            'message': 'Photo submitted for review — you will be notified when it is approved.',
        }, status=201)

    def list(self, request):
        qs = self.filter_queryset(self.get_queryset())
        data = []
        for pr in qs:
            data.append({
                'id': pr.id,
                'swimmer_id': pr.swimmer_id,
                'swimmer_name': pr.swimmer.name,
                'user_email': pr.user.email,
                'photo': pr.photo.url if pr.photo else '',
                'status': pr.status,
                'created_at': pr.created_at.isoformat(),
            })
        return Response(data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        pr = self.get_object()
        if pr.status != 'PENDING':
            return Response({'error': 'Already reviewed'}, status=400)
        pr.status = 'APPROVED'
        pr.reviewed_at = timezone.now()
        pr.save(update_fields=['status', 'reviewed_at'])
        # Apply the photo to the swimmer profile
        from swimmers.models import Swimmer
        swimmer = pr.swimmer
        swimmer.photo = pr.photo
        swimmer.save(update_fields=['photo'])
        return Response({'status': 'approved', 'swimmer_name': swimmer.name})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        pr = self.get_object()
        if pr.status != 'PENDING':
            return Response({'error': 'Already reviewed'}, status=400)
        pr.status = 'DECLINED'
        pr.reviewed_at = timezone.now()
        pr.save(update_fields=['status', 'reviewed_at'])
        # Email the athlete
        email = pr.user.email
        if email:
            base = django_settings.FRONTEND_URL
            try:
                send_mail(
                    f'Photo update declined for {pr.swimmer.name}',
                    f'Hi {pr.user.first_name or pr.user.username},\n\n'
                    f'Your photo update for "{pr.swimmer.name}" was declined. '
                    f'Please upload a clear, appropriate photo.\n\n'
                    f'You can try again at: {base}/swimmers/{pr.swimmer_id}\n\n'
                    f'— Arab Swim',
                    django_settings.DEFAULT_FROM_EMAIL, [email])
            except Exception:
                pass
        return Response({'status': 'declined'})

    @action(detail=False, methods=['post'], url_path='bulk-approve')
    def bulk_approve(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'No ids provided'}, status=400)
        from swimmers.models import Swimmer
        approved = 0
        for pr in PhotoRequest.objects.filter(id__in=ids, status='PENDING').select_related('swimmer'):
            pr.status = 'APPROVED'
            pr.reviewed_at = timezone.now()
            pr.save(update_fields=['status', 'reviewed_at'])
            pr.swimmer.photo = pr.photo
            pr.swimmer.save(update_fields=['photo'])
            approved += 1
        return Response({'approved': approved})

    @action(detail=False, methods=['post'], url_path='bulk-reject')
    def bulk_reject(self, request):
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'No ids provided'}, status=400)
        rejected = 0
        for pr in PhotoRequest.objects.filter(id__in=ids, status='PENDING').select_related('swimmer', 'user'):
            pr.status = 'DECLINED'
            pr.reviewed_at = timezone.now()
            pr.save(update_fields=['status', 'reviewed_at'])
            rejected += 1
        return Response({'rejected': rejected})


@api_view(['GET'])
def fina_points_preview(request):
    """Preview World Aquatics points for a time/event/gender/pool combo."""
    from importer.points import calculate_points
    try:
        time_cs = int(request.query_params.get('time_cs', 0))
        event_id = int(request.query_params.get('event', 0))
    except (TypeError, ValueError):
        return Response({'points': 0})
    gender = request.query_params.get('gender', 'M')
    pool = request.query_params.get('pool', 'LCM')
    event = Event.objects.filter(id=event_id).first()
    if not event or time_cs <= 0:
        return Response({'points': 0})
    return Response({'points': calculate_points(time_cs, event.name, gender, pool)})


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
            from django.db.models import Count, Q, Exists, OuterRef
            from medals.models import Medal
            counts = dict(
                Country.objects.annotate(
                    n=Count('swimmers', filter=Q(swimmers__is_relay_team=False))
                ).values_list('id', 'n')
            )
            club_counts = dict(
                Country.objects.annotate(n=Count('teams')).values_list('id', 'n')
            )
            # Medals won by each nation's swimmers at Arab championships
            # (relay podiums counted once via the relay-team placeholder row)
            placeholder = Medal.objects.filter(
                result=OuterRef('result'), swimmer__is_relay_team=True)
            medal_rows = (
                Medal.objects
                .filter(championship__classification__name='Arab')
                .exclude(Q(swimmer__is_relay_team=False) & Q(Exists(placeholder)))
                .values('swimmer__nationality_id')
                .annotate(
                    gold=Count('id', filter=Q(medal_type='GOLD')),
                    silver=Count('id', filter=Q(medal_type='SILVER')),
                    bronze=Count('id', filter=Q(medal_type='BRONZE')),
                )
            )
            medals = {m['swimmer__nationality_id']: m for m in medal_rows}
            for row in response.data:
                row['swimmers_count'] = counts.get(row['id'], 0)
                row['clubs_count'] = club_counts.get(row['id'], 0)
                m = medals.get(row['id'])
                row['gold'] = m['gold'] if m else 0
                row['silver'] = m['silver'] if m else 0
                row['bronze'] = m['bronze'] if m else 0
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
            'location': rec.location, 'meet_name': rec.meet_name,
            'date': rec.result_date, 'is_new': rec.is_new,
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


    @action(detail=True, methods=['get'])
    def progression(self, request, pk=None):
        """Time progression for a country's swimmers by stroke."""
        country = self.get_object()
        from championships.models import Result
        from django.db.models import Min, Count

        stroke = request.query_params.get('stroke', 'Freestyle')
        pool = request.query_params.get('pool', 'LCM')

        # Find events for this stroke with best times by this country's swimmers
        event_stats = (
            Result.objects.filter(
                swimmer__nationality=country, swimmer__is_relay_team=False,
                championship__pool=pool, event__is_relay=False,
                event__stroke=stroke, time_centiseconds__gt=0,
            )
            .values('event_id', 'event__name', 'event__sort_order')
            .annotate(count=Count('id'), best=Min('time_centiseconds'))
            .order_by('event__sort_order', 'event__distance')
        )

        lines = []
        for es in event_stats:
            # Fastest swim of each meet date → one point per meet, so the
            # chart shows the trend across meets. (Previously this took the
            # 5 most recent results — usually all from the same meet — which
            # collapsed into a single point.)
            rows = (
                Result.objects.filter(
                    swimmer__nationality=country, swimmer__is_relay_team=False,
                    event_id=es['event_id'], championship__pool=pool,
                    event__is_relay=False, time_centiseconds__gt=0,
                )
                .values('championship__date', 'championship__name',
                        'swimmer__name', 'time_centiseconds', 'fina_points')
                .order_by('championship__date', 'time_centiseconds')
            )
            best_by_date = {}
            for r in rows:
                d = r['championship__date']
                if d not in best_by_date:  # first per date = fastest (ordering)
                    best_by_date[d] = r
            points = [{
                'date': d.isoformat(),
                'time': _fmt_cs(best_by_date[d]['time_centiseconds']),
                'time_cs': best_by_date[d]['time_centiseconds'],
                'meet': best_by_date[d]['championship__name'],
                'swimmer': best_by_date[d]['swimmer__name'],
                'fina': best_by_date[d]['fina_points'],
            } for d in sorted(best_by_date)]
            if points:
                lines.append({
                    'event_id': es['event_id'],
                    'event_name': es['event__name'],
                    'points': points,
                })

        return Response(lines)


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        # ?has_results=true → only events that have at least one result
        if self.request.query_params.get('has_results') == 'true':
            qs = qs.filter(results__isnull=False).distinct()
        return qs
