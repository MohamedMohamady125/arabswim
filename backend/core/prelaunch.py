"""Pre-launch lock.

While the site is being filled in before its public launch, nobody but an
admin may browse it: an invited owner sees only their own page (the frontend
enforces which page), and a visitor who is not signed in gets nothing at all —
the API answers 401 to them, so the data cannot be read by going around the
website either.

The lock is the site feature `prelaunch` (Dashboard → Site sections). It is
ON until an admin turns it off: a missing row means locked.
"""
import sys

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

KEY = 'prelaunch'
_CACHE_KEY = 'core.prelaunch.on'

# What a visitor who is not signed in may still reach: signing in, opening an
# invite link, reading the flags that tell the website it is locked, and
# voting in the Arabswim Awards.
OPEN_PATHS = (
    '/api/v1/auth/login/',
    '/api/v1/auth/refresh/',
    '/api/v1/auth/invites/open/',
    '/api/v1/features/',
    '/api/v1/analytics/track/',
    # Arabswim Awards: a vote link is shared publicly before launch
    '/api/v1/awards/vote/',
)


def enforced():
    """Off inside the test runner (every test calls the API anonymously);
    tests of the lock itself switch it on with PRELAUNCH_ENFORCED."""
    forced = getattr(settings, 'PRELAUNCH_ENFORCED', None)
    return forced if forced is not None else 'test' not in sys.argv


def prelaunch_on():
    val = cache.get(_CACHE_KEY)
    if val is None:
        from .models import SiteFeature
        row = SiteFeature.objects.filter(key=KEY).values_list('enabled', flat=True).first()
        val = True if row is None else bool(row)
        cache.set(_CACHE_KEY, val, 20)
    return val


def forget_cached_state():
    cache.delete(_CACHE_KEY)


def _signed_in(request):
    if getattr(request, 'user', None) is not None and request.user.is_authenticated:
        return True  # Django admin session
    try:
        from rest_framework_simplejwt.authentication import JWTAuthentication
        return JWTAuthentication().authenticate(request) is not None
    except Exception:
        return False


class PrelaunchLockMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if (path.startswith('/api/v1/') and request.method != 'OPTIONS'
                and not path.startswith(OPEN_PATHS) and enforced() and prelaunch_on()
                and not _signed_in(request)):
            return JsonResponse({'detail': 'Arab Swim is not open yet.', 'code': 'prelaunch'}, status=401)
        return self.get_response(request)
