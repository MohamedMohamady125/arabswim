"""Invite links: the admin picks one academy / club / federation / swimmer
and gets a link; whoever opens it creates the account that owns that page.

    POST   /auth/invites/                 admin: create a link for one entity
    GET    /auth/invites/                 admin: every link and its state
    POST   /auth/invites/<id>/revoke/     admin: kill a link that was not used
    GET    /auth/invites/open/<token>/    public: who the link is for, is it usable
    POST   /auth/invites/open/<token>/    public: create the account and sign in
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Country, Invite
from .permissions import IsAdmin
from .serializers import UserSerializer

User = get_user_model()

WHY_NOT = {
    'USED': 'This link has already been used to create an account. Sign in instead.',
    'REVOKED': 'This link was cancelled. Ask Arab Swim for a new one.',
    'EXPIRED': 'This link has expired. Ask Arab Swim for a new one.',
}


def _file_url(request, f):
    return request.build_absolute_uri(f.url) if f else None


def _target_model(kind):
    if kind == 'ACADEMY':
        from academies.models import Academy
        return Academy
    if kind == 'CLUB':
        from teams.models import Team
        return Team
    if kind == 'FEDERATION':
        return Country
    from swimmers.models import Swimmer
    return Swimmer


def existing_account(kind, target):
    """The account that already owns this entity, if any (one owner each)."""
    field = Invite.TARGET_FIELD[kind]
    if kind == 'ATHLETE':
        # a swimmer is linked one-to-one, whatever the account's role says
        return User.objects.filter(swimmer=target).first()
    return User.objects.filter(role=kind, **{field: target}).first()


def describe_target(request, kind, target):
    """What the sign-up page shows about the entity — public data only."""
    out = {'id': target.pk, 'name': target.name, 'image': None, 'flag_code': None, 'path': ''}
    if kind == 'ACADEMY':
        out.update(image=_file_url(request, target.logo), path=f'/academies/{target.pk}',
                   flag_code=getattr(target.country, 'code', None))
    elif kind == 'CLUB':
        # an academy that lives on the club portal is an academy to its owner
        out.update(image=_file_url(request, target.logo), path=f'/teams/{target.pk}',
                   flag_code=getattr(target.country, 'code', None),
                   is_academy=bool(target.is_academy))
    elif kind == 'FEDERATION':
        out.update(name=f'{target.name} Swimming Federation', flag_code=target.code,
                   path=f'/countries/{target.pk}')
    else:
        out.update(image=_file_url(request, target.photo), path=f'/swimmers/{target.pk}',
                   flag_code=getattr(target.nationality, 'code', None))
    return out


def invite_payload(request, inv, admin=False):
    data = {
        'kind': inv.kind,
        'kind_label': 'Academy' if inv.kind == 'CLUB' and inv.team.is_academy else inv.get_kind_display(),
        'status': inv.status,
        'expires_at': inv.expires_at,
        'target': describe_target(request, inv.kind, inv.target),
    }
    if admin:
        data.update(
            id=inv.id, token=inv.token, created_at=inv.created_at, used_at=inv.used_at,
            used_by=inv.used_by.email if inv.used_by_id else None,
        )
    return data


@api_view(['GET', 'POST'])
@permission_classes([IsAdmin])
def invites(request):
    if request.method == 'GET':
        qs = (Invite.objects
              .select_related('academy__country', 'team__country', 'country', 'swimmer__nationality', 'used_by'))
        kind = str(request.query_params.get('kind', '')).upper()
        if kind in Invite.TARGET_FIELD:
            qs = qs.filter(kind=kind)
        return Response([invite_payload(request, i, admin=True) for i in qs[:500] if i.target is not None])

    kind = str(request.data.get('kind', '')).upper()
    if kind not in Invite.TARGET_FIELD:
        return Response({'error': 'kind must be ACADEMY, CLUB, FEDERATION or ATHLETE'}, status=400)
    target = _target_model(kind).objects.filter(pk=request.data.get('target')).first()
    if target is None:
        return Response({'error': 'Pick who the link is for'}, status=400)
    if kind == 'ATHLETE' and getattr(target, 'is_relay_team', False):
        return Response({'error': 'A relay team cannot have an account'}, status=400)
    owner = existing_account(kind, target)
    if owner:
        return Response({'error': f'{target.name} already has an account ({owner.email or owner.username}).'},
                        status=400)
    field = Invite.TARGET_FIELD[kind]
    # one live link per entity: making a new one cancels the old unused ones
    Invite.objects.filter(kind=kind, used_at__isnull=True, revoked=False, **{field: target}).update(revoked=True)
    inv = Invite.objects.create(kind=kind, created_by=request.user, **{field: target})
    return Response(invite_payload(request, inv, admin=True), status=201)


@api_view(['POST'])
@permission_classes([IsAdmin])
def revoke_invite(request, pk):
    inv = Invite.objects.filter(pk=pk).first()
    if inv is None:
        return Response({'error': 'No such link'}, status=404)
    if inv.used_at:
        return Response({'error': 'This link was already used; the account exists.'}, status=400)
    inv.revoked = True
    inv.save(update_fields=['revoked'])
    return Response(invite_payload(request, inv, admin=True))


@api_view(['GET', 'POST'])
@permission_classes([permissions.AllowAny])
def open_invite(request, token):
    inv = (Invite.objects
           .select_related('academy__country', 'team__country', 'country', 'swimmer__nationality')
           .filter(token=token).first())
    if inv is None or inv.target is None:
        return Response({'error': 'This link is not valid. Check that you copied all of it.'}, status=404)
    if request.method == 'GET':
        data = invite_payload(request, inv)
        data['usable'] = inv.status == 'PENDING'
        data['message'] = WHY_NOT.get(inv.status, '')
        return Response(data)

    email = str(request.data.get('email', '')).strip().lower()
    password = str(request.data.get('password', ''))
    errors = {}
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        errors['email'] = 'Enter a valid email address.'
    elif User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
        errors['email'] = 'An account with this email already exists. Sign in instead.'
    try:
        validate_password(password, user=User(username=email, email=email))
    except ValidationError as e:
        errors['password'] = ' '.join(e.messages)
    if errors:
        return Response({'errors': errors}, status=400)

    with transaction.atomic():
        # lock the row: two people opening the same link cannot both win
        inv = Invite.objects.select_for_update().get(pk=inv.pk)
        if inv.status != 'PENDING':
            return Response({'error': WHY_NOT[inv.status]}, status=400)
        if existing_account(inv.kind, inv.target):
            return Response({'error': 'This page already has an account. Sign in instead.'}, status=400)
        field = Invite.TARGET_FIELD[inv.kind]
        user = User.objects.create_user(username=email, email=email, password=password,
                                        role=inv.kind, **{field: inv.target})
        inv.used_at = timezone.now()
        inv.used_by = user
        inv.save(update_fields=['used_at', 'used_by'])

    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'target': describe_target(request, inv.kind, inv.target),
    }, status=201)


# ---- sign in with the email as well as the username -------------------------
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer  # noqa: E402
from rest_framework_simplejwt.views import TokenObtainPairView  # noqa: E402


class EmailOrUsernameTokenSerializer(TokenObtainPairSerializer):
    """Invited owners sign in with the email they chose. Older accounts have a
    separate username: typing either one works (Postel's Law)."""

    def validate(self, attrs):
        typed = str(attrs.get(self.username_field, '')).strip()
        if typed and not User.objects.filter(username=typed).exists():
            match = User.objects.filter(email__iexact=typed).order_by('id')
            if match.count() == 1:
                attrs[self.username_field] = match.first().username
            else:
                by_name = User.objects.filter(username__iexact=typed)
                if by_name.count() == 1:
                    attrs[self.username_field] = by_name.first().username
        return super().validate(attrs)


class LoginView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenSerializer

