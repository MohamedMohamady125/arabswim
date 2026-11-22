from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Inductee
from .serializers import InducteeSerializer


class InducteeViewSet(viewsets.ModelViewSet):
    queryset = Inductee.objects.select_related('country', 'swimmer', 'swimmer__nationality')
    serializer_class = InducteeSerializer
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['display_order', 'inducted_year', 'name']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        country = self.request.query_params.get('country')
        # Postel's Law: a malformed id matches nothing instead of a 500
        if country:
            qs = qs.filter(country_id=country) if country.isdigit() else qs.none()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category.upper())
        return qs

    @action(detail=True, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        inductee = self.get_object()
        photo = request.FILES.get('photo')
        from core.uploads import validate_image
        err = validate_image(photo)
        if err:
            return Response({'error': err}, status=400)
        inductee.photo = photo
        inductee.save()
        return Response({'message': 'Photo uploaded successfully', 'photo': inductee.photo.url})


# ───────────────────────── Arabswim Awards voting ─────────────────────────
from django.db import IntegrityError, transaction
from django.db.models import Count
from rest_framework import permissions
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from core.permissions import IsAdmin
from .models import AwardPoll, AwardNominee, AwardVote
from .serializers import AwardPollSerializer, AwardNomineeSerializer
from . import voting


def _standings(poll):
    """Nominees with their votes, most votes first; a full tie is alphabetical."""
    counts = dict(AwardVote.objects.filter(poll=poll).values_list('nominee_id')
                  .annotate(n=Count('id')).values_list('nominee_id', 'n'))
    rows = AwardNomineeSerializer(
        poll.nominees.select_related('country', 'swimmer').all(), many=True).data
    total = sum(counts.values())
    for r in rows:
        r['votes'] = counts.get(r['id'], 0)
        r['percent'] = round(100 * r['votes'] / total) if total else 0
    ranked = sorted(rows, key=lambda r: (-r['votes'], r['name'].casefold()))
    return rows, ranked, total


class AwardPollViewSet(viewsets.ModelViewSet):
    """Admin: create a vote, open and close it, read the count, announce the winner."""
    queryset = AwardPoll.objects.all()
    serializer_class = AwardPollSerializer
    permission_classes = [IsAdmin]
    pagination_class = None

    def _full(self, poll):
        data = AwardPollSerializer(poll).data
        _, ranked, total = _standings(poll)
        data['nominees'] = ranked
        data['total_votes'] = total
        # many votes from few networks is the sign of one person voting again and again
        data['networks'] = AwardVote.objects.filter(poll=poll).values('network').distinct().count()
        return data

    def list(self, request, *args, **kwargs):
        return Response([self._full(p) for p in self.get_queryset()])

    def retrieve(self, request, *args, **kwargs):
        return Response(self._full(self.get_object()))

    @action(detail=True, methods=['post'])
    def announce(self, request, pk=None):
        """Close the vote and put the winner in the Hall of Fame (Arabswim Awards)."""
        poll = self.get_object()
        _, ranked, total = _standings(poll)
        chosen = request.data.get('nominee')
        if chosen:
            nominee = poll.nominees.filter(pk=chosen).first()
        else:
            nominee = poll.nominees.filter(pk=ranked[0]['id']).first() if ranked and total else None
        if nominee is None:
            return Response({'error': 'There is no winner to announce yet.'}, status=400)
        if nominee.country_id is None:
            return Response({'error': f'Set the country of {nominee.name} first.'}, status=400)
        with transaction.atomic():
            poll.winner = nominee
            poll.status = AwardPoll.CLOSED
            poll.save(update_fields=['winner', 'status'])
            entry = Inductee.objects.filter(
                category='ARAB_WINNER', inducted_year=poll.year, achievements=poll.title).first()
            if entry is None:
                entry = Inductee(category='ARAB_WINNER', inducted_year=poll.year, achievements=poll.title)
            entry.swimmer = nominee.swimmer
            entry.name = nominee.name
            entry.country = nominee.country
            if nominee.photo:
                entry.photo = nominee.photo.name
            entry.save()
        return Response(self._full(poll))


class AwardNomineeViewSet(viewsets.ModelViewSet):
    queryset = AwardNominee.objects.select_related('country', 'swimmer')
    serializer_class = AwardNomineeSerializer
    permission_classes = [IsAdmin]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        swimmer = serializer.validated_data.get('swimmer')
        extra = {}
        if swimmer and not serializer.validated_data.get('country'):
            extra['country'] = swimmer.nationality
        serializer.save(**extra)


class VoteThrottle(AnonRateThrottle):
    scope = 'award_vote'
    rate = '12/minute'

    def get_cache_key(self, request, view):
        if request.method != 'POST':
            return None
        return self.cache_format % {'scope': self.scope, 'ident': voting.network_key(request)}


def _public_poll(poll, voter):
    """What a voter sees. Vote counts appear only when the admin allows it
    (after voting), or once the winner is announced."""
    mine = None
    if voter:
        mine = (AwardVote.objects.filter(poll=poll, voter=voter)
                .values_list('nominee_id', flat=True).first())
    rows, ranked, total = _standings(poll)
    announced = poll.winner_id is not None
    reveal = announced or (poll.show_results and mine is not None)
    nominees = ranked if reveal else rows
    if not reveal:
        for r in nominees:
            r.pop('votes', None)
            r.pop('percent', None)
    return {
        'title': poll.title, 'year': poll.year, 'slug': poll.slug,
        'description': poll.description, 'closes_at': poll.closes_at,
        'open': poll.is_open, 'voted_for': mine, 'results': reveal,
        'winner': poll.winner_id, 'total_votes': total if reveal else None,
        'nominees': nominees,
    }


class OpenPollsView(APIView):
    """The votes that are open right now (for the banner in the Hall of Fame)."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response([{'title': p.title, 'year': p.year, 'slug': p.slug, 'closes_at': p.closes_at}
                         for p in AwardPoll.objects.filter(status=AwardPoll.OPEN) if p.is_open])


class VoteView(APIView):
    """Public: read one vote by its link, and cast a vote in it."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [VoteThrottle]

    def _poll(self, slug):
        # a draft has no public page yet
        return AwardPoll.objects.exclude(status=AwardPoll.DRAFT).filter(slug=slug).first()

    def get(self, request, slug):
        poll = self._poll(slug)
        if poll is None:
            return Response({'error': 'This vote does not exist.'}, status=404)
        return Response(_public_poll(poll, voting.voter_key(request.query_params.get('voter'))))

    def post(self, request, slug):
        poll = self._poll(slug)
        if poll is None:
            return Response({'error': 'This vote does not exist.'}, status=404)
        voter = voting.voter_key(request.data.get('voter'))
        if voter is None:
            return Response({'error': 'Your browser blocked the vote. Open the link in your normal browser and try again.'}, status=400)
        if not poll.is_open:
            return Response({'error': 'This vote is closed.', 'poll': _public_poll(poll, voter)}, status=409)
        nominee = poll.nominees.filter(pk=request.data.get('nominee')).first()
        if nominee is None:
            return Response({'error': 'Choose one of the nominees.'}, status=400)
        network = voting.network_key(request)
        if AwardVote.objects.filter(poll=poll, network=network).count() >= voting.VOTES_PER_NETWORK:
            return Response({'error': 'Too many votes came from this network. Try again on mobile data.'}, status=429)
        try:
            with transaction.atomic():
                AwardVote.objects.create(poll=poll, nominee=nominee, voter=voter, network=network)
        except IntegrityError:
            return Response({'error': 'You have already voted.', 'poll': _public_poll(poll, voter)}, status=409)
        return Response(_public_poll(poll, voter), status=201)
