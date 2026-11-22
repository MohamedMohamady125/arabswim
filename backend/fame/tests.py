from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from core.models import Country
from .models import AwardPoll, AwardNominee, AwardVote, Inductee
from . import voting

DEVICE_A = 'a' * 32
DEVICE_B = 'b' * 32


class AwardVotingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.country = Country.objects.create(name='Testland', code='TST')
        self.poll = AwardPoll.objects.create(title='Swimmer of the Year', year=2026, status=AwardPoll.OPEN)
        self.n1 = AwardNominee.objects.create(poll=self.poll, name='Zed', country=self.country)
        self.n2 = AwardNominee.objects.create(poll=self.poll, name='Amy', country=self.country)
        self.url = f'/api/v1/awards/vote/{self.poll.slug}/'
        self.admin = get_user_model().objects.create_user('adm', password='x', role='ADMIN')

    def vote(self, nominee, device, ip='10.0.0.1'):
        return self.client.post(self.url, {'nominee': nominee.id, 'voter': device},
                                format='json', HTTP_X_FORWARDED_FOR=ip)

    def test_one_vote_per_device(self):
        self.assertEqual(self.vote(self.n1, DEVICE_A).status_code, 201)
        again = self.vote(self.n2, DEVICE_A)
        self.assertEqual(again.status_code, 409)
        self.assertEqual(AwardVote.objects.count(), 1)
        # the page still knows who this device voted for
        self.assertEqual(again.json()['poll']['voted_for'], self.n1.id)

    def test_votes_from_one_network_are_capped(self):
        with override_settings():
            voting.VOTES_PER_NETWORK, old = 2, voting.VOTES_PER_NETWORK
            try:
                self.assertEqual(self.vote(self.n1, 'c' * 32).status_code, 201)
                self.assertEqual(self.vote(self.n1, 'd' * 32).status_code, 201)
                self.assertEqual(self.vote(self.n1, 'e' * 32).status_code, 429)
                # another network still votes
                self.assertEqual(self.vote(self.n1, 'f' * 32, ip='10.0.0.2').status_code, 201)
            finally:
                voting.VOTES_PER_NETWORK = old

    def test_a_vote_needs_a_device_id_and_an_open_poll(self):
        self.assertEqual(self.vote(self.n1, 'short').status_code, 400)
        self.poll.status = AwardPoll.CLOSED
        self.poll.save()
        self.assertEqual(self.vote(self.n1, DEVICE_A).status_code, 409)
        self.assertEqual(AwardVote.objects.count(), 0)

    def test_a_draft_has_no_public_page(self):
        self.poll.status = AwardPoll.DRAFT
        self.poll.save()
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_counts_are_hidden_until_allowed(self):
        self.vote(self.n1, DEVICE_A)
        body = self.client.get(self.url, {'voter': DEVICE_A}).json()
        self.assertFalse(body['results'])
        self.assertNotIn('votes', body['nominees'][0])
        self.poll.show_results = True
        self.poll.save()
        # shown to someone who voted, not to someone who has not
        self.assertTrue(self.client.get(self.url, {'voter': DEVICE_A}).json()['results'])
        self.assertFalse(self.client.get(self.url, {'voter': DEVICE_B}).json()['results'])

    def test_announce_puts_the_winner_in_the_hall_of_fame(self):
        self.vote(self.n2, DEVICE_A)
        self.vote(self.n2, DEVICE_B, ip='10.0.0.2')
        self.vote(self.n1, 'c' * 32, ip='10.0.0.3')
        self.assertEqual(self.client.post(f'/api/v1/awards/polls/{self.poll.id}/announce/').status_code, 401)
        self.client.force_authenticate(self.admin)
        res = self.client.post(f'/api/v1/awards/polls/{self.poll.id}/announce/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['winner'], self.n2.id)
        entry = Inductee.objects.get(category='ARAB_WINNER')
        self.assertEqual((entry.name, entry.inducted_year), ('Amy', 2026))
        # announcing again does not add a second entry
        self.client.post(f'/api/v1/awards/polls/{self.poll.id}/announce/')
        self.assertEqual(Inductee.objects.count(), 1)

    def test_a_full_tie_is_listed_alphabetically(self):
        self.client.force_authenticate(self.admin)
        names = [n['name'] for n in self.client.get(f'/api/v1/awards/polls/{self.poll.id}/').json()['nominees']]
        self.assertEqual(names, ['Amy', 'Zed'])

    @override_settings(PRELAUNCH_ENFORCED=True)
    def test_voting_is_open_while_the_site_is_locked(self):
        self.assertEqual(self.client.get('/api/v1/hall-of-fame/').status_code, 401)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.vote(self.n1, DEVICE_A).status_code, 201)
        self.assertEqual(self.client.get('/api/v1/awards/polls/').status_code, 401)
