from datetime import date, timedelta

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from championships.models import Championship
from .engine import compute_snapshot, fill_rising
from .models import PredictionEntry, PredictionSnapshot
from .serializers import PredictionEntrySerializer

PREDICTABLE_CLASSIFICATIONS = ['Arab', 'GCC', 'National']
STALE_AFTER = timedelta(hours=24)


def _upcoming_qs():
    return (
        Championship.objects
        .filter(date__gte=date.today(),
                classification__name__in=PREDICTABLE_CLASSIFICATIONS)
        .select_related('classification', 'country')
        .order_by('date')
    )


def _get_or_compute(championship, force=False):
    snap = PredictionSnapshot.objects.filter(championship=championship).first()
    stale = snap is None or (timezone.now() - snap.computed_at) > STALE_AFTER
    if force or stale:
        data = compute_snapshot(championship)
        previous = snap.data if snap else {}
        fill_rising(data, previous)
        if snap is None:
            snap = PredictionSnapshot(championship=championship)
        else:
            snap.previous_data = previous
        snap.data = data
        snap.stage = data['stage']
        snap.save()
    return snap


class PredictionViewSet(viewsets.ViewSet):
    """Medal predictions for upcoming Arab / GCC / National championships."""

    def list(self, request):
        out = []
        for champ in _upcoming_qs():
            snap = PredictionSnapshot.objects.filter(championship=champ).first()
            out.append({
                'id': champ.id,
                'name': champ.name,
                'date': str(champ.date),
                'end_date': str(champ.end_date) if champ.end_date else None,
                'pool': champ.pool,
                'classification': champ.classification.name if champ.classification else None,
                'country': champ.country.name if champ.country else None,
                'stage': snap.stage if snap else None,
                'confidence': snap.data.get('confidence') if snap else None,
                'updated_at': snap.computed_at.isoformat() if snap else None,
                'event_count': snap.data.get('event_count') if snap else None,
            })
        return Response(out)

    def retrieve(self, request, pk=None):
        try:
            champ = _upcoming_qs().get(pk=pk)
        except Championship.DoesNotExist:
            return Response({'detail': 'No upcoming championship with this id'},
                            status=status.HTTP_404_NOT_FOUND)
        snap = _get_or_compute(champ)
        data = dict(snap.data)
        data['updated_at'] = snap.computed_at.isoformat()
        # keep the payload light: events index only, fields via the event action
        data['events_index'] = [
            {'event_id': e['event_id'], 'event': e['event'], 'stroke': e['stroke'],
             'distance': e['distance'], 'gender': e['gender']}
            for e in data.get('events', [])
        ]
        return Response(data)

    @action(detail=True, methods=['get'])
    def event(self, request, pk=None):
        event_id = request.query_params.get('event')
        gender = request.query_params.get('gender', 'M')
        snap = PredictionSnapshot.objects.filter(championship_id=pk).first()
        if not snap:
            return Response({'detail': 'Prediction not computed yet'},
                            status=status.HTTP_404_NOT_FOUND)
        for e in snap.data.get('events', []):
            if str(e['event_id']) == str(event_id) and e['gender'] == gender:
                return Response(e)
        return Response({'detail': 'No prediction for this event'},
                        status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def recompute(self, request, pk=None):
        try:
            champ = Championship.objects.get(pk=pk)
        except Championship.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        snap = _get_or_compute(champ, force=True)
        return Response({'stage': snap.stage, 'updated_at': snap.computed_at.isoformat(),
                         'event_count': snap.data.get('event_count')})

    @action(detail=True, methods=['get', 'post'])
    def entries(self, request, pk=None):
        if request.method == 'GET':
            qs = (PredictionEntry.objects.filter(championship_id=pk)
                  .select_related('swimmer', 'event', 'swimmer__nationality')
                  .order_by('event__sort_order', 'swimmer__name'))
            return Response(PredictionEntrySerializer(qs, many=True).data)
        payload = dict(request.data)
        payload['championship'] = pk
        ser = PredictionEntrySerializer(data=payload)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete', 'patch'],
            url_path='entries/(?P<entry_id>[0-9]+)')
    def entry_detail(self, request, pk=None, entry_id=None):
        try:
            entry = PredictionEntry.objects.get(pk=entry_id, championship_id=pk)
        except PredictionEntry.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if request.method == 'DELETE':
            entry.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        ser = PredictionEntrySerializer(entry, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    @action(detail=True, methods=['post'], url_path='entries/seed')
    def seed_entries(self, request, pk=None):
        """Copy the automatic EARLY field into editable official entries."""
        try:
            champ = Championship.objects.get(pk=pk)
        except Championship.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        snap = PredictionSnapshot.objects.filter(championship=champ).first()
        if not snap or not snap.data.get('events'):
            return Response({'detail': 'Compute a prediction first'},
                            status=status.HTTP_400_BAD_REQUEST)
        created = 0
        for ev in snap.data['events']:
            for row in ev['field']:
                _, was_created = PredictionEntry.objects.get_or_create(
                    championship=champ, swimmer_id=row['swimmer_id'],
                    event_id=ev['event_id'],
                    defaults={'entry_time_cs': row['seed_cs']})
                created += int(was_created)
        return Response({'created': created})
