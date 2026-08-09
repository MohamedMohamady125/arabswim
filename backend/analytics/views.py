from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate, ExtractHour
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.permissions import is_admin
from .models import PageView

# User-agent fragments that identify crawlers/bots — those hits are dropped.
BOT_MARKERS = (
    'bot', 'spider', 'crawl', 'slurp', 'headless', 'lighthouse',
    'facebookexternalhit', 'whatsapp', 'telegram', 'preview', 'python-requests',
    'curl/', 'wget/', 'axios/', 'go-http-client', 'okhttp', 'phantom',
)


def _parse_ua(ua):
    """Return (device, browser) from a raw user-agent, or (None, None) for bots."""
    low = (ua or '').lower()
    if not low or any(m in low for m in BOT_MARKERS):
        return None, None
    if 'ipad' in low or ('tablet' in low and 'mobile' not in low):
        device = 'tablet'
    elif 'mobi' in low or 'iphone' in low or 'android' in low:
        device = 'mobile'
    else:
        device = 'desktop'
    if 'edg/' in low or 'edga/' in low or 'edgios/' in low:
        browser = 'Edge'
    elif 'samsungbrowser' in low:
        browser = 'Samsung Internet'
    elif 'opr/' in low or 'opera' in low:
        browser = 'Opera'
    elif 'firefox/' in low or 'fxios/' in low:
        browser = 'Firefox'
    elif 'chrome/' in low or 'crios/' in low:
        browser = 'Chrome'
    elif 'safari/' in low:
        browser = 'Safari'
    else:
        browser = 'Other'
    return device, browser


OWN_DOMAINS = ('arabswim', 'localhost', '127.0.0.1')


def _referrer_domain(raw):
    """Extract just the domain from a referrer URL; '' for direct/own-site."""
    raw = (raw or '').strip()
    if not raw:
        return ''
    try:
        domain = raw.split('//', 1)[-1].split('/', 1)[0].split(':', 1)[0].lower()
    except Exception:
        return ''
    if not domain or any(own in domain for own in OWN_DOMAINS):
        return ''
    return domain[:300]


class TrackThrottle(AnonRateThrottle):
    rate = '120/min'


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([TrackThrottle])
def track(request):
    """Record one page view. Anonymous — no auth, no IP stored."""
    data = request.data or {}
    path = str(data.get('path') or '')[:300]
    visitor = str(data.get('visitor') or '')[:64]
    session = str(data.get('session') or '')[:64]
    if not path.startswith('/') or not visitor or not session:
        return Response(status=204)

    device, browser = _parse_ua(request.META.get('HTTP_USER_AGENT', ''))
    if device is None:  # bot
        return Response(status=204)

    country = (request.META.get('HTTP_CF_IPCOUNTRY')
               or request.META.get('HTTP_X_VERCEL_IP_COUNTRY') or '')[:64]
    if country in ('XX', 'T1'):
        country = ''

    PageView.objects.create(
        path=path,
        visitor=visitor,
        session=session,
        referrer=_referrer_domain(data.get('referrer')),
        device=device,
        browser=browser,
        country=country,
        is_new_visitor=bool(data.get('is_new')),
    )
    return Response(status=204)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def summary(request):
    """Full analytics summary for the admin dashboard. ?days=30 (1–365)."""
    if not is_admin(request.user):
        return Response({'detail': 'Admin only.'}, status=403)

    try:
        days = min(max(int(request.query_params.get('days', 30)), 1), 365)
    except (TypeError, ValueError):
        days = 30

    now = timezone.now()
    since = now - timedelta(days=days)
    prev_since = since - timedelta(days=days)
    qs = PageView.objects.filter(ts__gte=since)

    views = qs.count()
    visitors = qs.values('visitor').distinct().count()
    sessions = qs.values('session').distinct().count()
    new_visitors = qs.filter(is_new_visitor=True).values('visitor').distinct().count()

    prev_qs = PageView.objects.filter(ts__gte=prev_since, ts__lt=since)
    prev_views = prev_qs.count()
    prev_visitors = prev_qs.values('visitor').distinct().count()

    def growth(cur, prev):
        if not prev:
            return None
        return round((cur - prev) / prev * 100, 1)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_qs = PageView.objects.filter(ts__gte=today_start)

    # Daily series with empty days filled in
    by_day = {r['d']: r for r in (
        qs.annotate(d=TruncDate('ts')).values('d')
          .annotate(views=Count('id'), visitors=Count('visitor', distinct=True))
    )}
    daily = []
    for i in range(days):
        d = (since + timedelta(days=i + 1)).date()
        row = by_day.get(d)
        daily.append({
            'date': d.isoformat(),
            'views': row['views'] if row else 0,
            'visitors': row['visitors'] if row else 0,
        })

    top_pages = list(
        qs.values('path')
          .annotate(views=Count('id'), visitors=Count('visitor', distinct=True))
          .order_by('-views')[:15]
    )
    referrers = list(
        qs.exclude(referrer='').values('referrer')
          .annotate(views=Count('id'))
          .order_by('-views')[:10]
    )
    direct_views = qs.filter(referrer='').count()
    devices = list(qs.values('device').annotate(views=Count('id')).order_by('-views'))
    browsers = list(
        qs.exclude(browser='').values('browser')
          .annotate(views=Count('id')).order_by('-views')[:6]
    )
    countries = list(
        qs.exclude(country='').values('country')
          .annotate(views=Count('id'), visitors=Count('visitor', distinct=True))
          .order_by('-views')[:10]
    )
    hourly_raw = {r['h']: r['views'] for r in (
        qs.annotate(h=ExtractHour('ts')).values('h').annotate(views=Count('id'))
    )}
    hourly = [{'hour': h, 'views': hourly_raw.get(h, 0)} for h in range(24)]

    return Response({
        'days': days,
        'totals': {
            'views': views,
            'visitors': visitors,
            'sessions': sessions,
            'new_visitors': new_visitors,
            'returning_visitors': max(visitors - new_visitors, 0),
            'views_per_visitor': round(views / visitors, 1) if visitors else 0,
            'views_growth': growth(views, prev_views),
            'visitors_growth': growth(visitors, prev_visitors),
            'views_today': today_qs.count(),
            'visitors_today': today_qs.values('visitor').distinct().count(),
            'live_visitors': PageView.objects.filter(
                ts__gte=now - timedelta(minutes=5)
            ).values('visitor').distinct().count(),
        },
        'daily': daily,
        'top_pages': top_pages,
        'referrers': referrers,
        'direct_views': direct_views,
        'devices': devices,
        'browsers': browsers,
        'countries': countries,
        'hourly': hourly,
    })
