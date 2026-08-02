from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_admin(user):
    return bool(user and user.is_authenticated and (user.role == 'ADMIN' or user.is_superuser))


def user_manages_team(user, team):
    """Admins manage everything; CLUB users manage their own team;
    FEDERATION users manage national teams of their country."""
    if team is None:
        return is_admin(user)
    if is_admin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    if user.role == 'CLUB' and user.team_id:
        return user.team_id == team.id
    if user.role == 'FEDERATION' and user.country_id:
        return bool(team.is_national_team) and team.country_id == user.country_id
    return False


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)


class IsAdminOrReadOnly(BasePermission):
    """Global default: public reads, admin-only writes."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return is_admin(request.user)


class CanEditOwnSwimmer(BasePermission):
    """Reads for everyone; writes for admins or the swimmer's linked account."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if is_admin(request.user):
            return True
        return getattr(request.user, 'swimmer_id', None) == obj.id


class CanManageTeamPortal(BasePermission):
    """Reads for everyone. Creates require a `team` the user manages.
    Object writes require managing the object's team (or the team itself)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not (request.user and request.user.is_authenticated):
            return False
        if is_admin(request.user):
            return True
        if request.method == 'POST' and getattr(view, 'action', None) == 'create':
            team_id = request.data.get('team')
            if not team_id:
                return False
            from teams.models import Team
            team = Team.objects.filter(pk=team_id).first()
            return user_manages_team(request.user, team)
        return True

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if obj.__class__.__name__ == 'Team':
            team = obj
        elif hasattr(obj, 'team'):
            team = obj.team
        elif hasattr(obj, 'album'):  # MediaItem → Album → Team
            team = getattr(obj.album, 'team', None)
        else:
            team = None
        return user_manages_team(request.user, team)
