from django.test import TestCase

# Create your tests here.


class QualifiedACutHidesBCutsTests(TestCase):
    """Swimmers who qualified: once a swimmer has an A cut, their B cuts are
    not listed; a swimmer with B cuts only keeps them."""

    def test_b_cuts_are_dropped_for_a_swimmer_with_an_a_cut(self):
        from rest_framework.test import APIClient
        from core.models import Country, Event
        from swimmers.models import Swimmer
        from championships.models import Championship, Result
        from qualifying_times.models import QualifyingStandard, QualifyingTime
        tun = Country.objects.create(name='Tunisia', code='TUN', region='ARAB')
        e50 = Event.objects.create(name='50 M Freestyle', distance=50, stroke='Freestyle', sort_order=1)
        e100 = Event.objects.create(name='100 M Freestyle', distance=100, stroke='Freestyle', sort_order=2)
        std = QualifyingStandard.objects.create(name='Worlds 2026', year=2026)
        for ev, a, b in ((e50, 2200, 2300), (e100, 4800, 5000)):
            QualifyingTime.objects.create(standard=std, event=ev, gender='M', cut='A', pool='LCM', time_centiseconds=a)
            QualifyingTime.objects.create(standard=std, event=ev, gender='M', cut='B', pool='LCM', time_centiseconds=b)
        meet = Championship.objects.create(name='Meet', date='2026-03-01', pool='LCM', country=tun)
        both = Swimmer.objects.create(name='Both CUTS', sex='M', nationality=tun, birth_year=2000)
        only_b = Swimmer.objects.create(name='Only B', sex='M', nationality=tun, birth_year=2000)
        swim = lambda s, ev, cs: Result.objects.create(championship=meet, event=ev, swimmer=s, nationality=tun,
                                                       time_centiseconds=cs, round_type='Finals')
        swim(both, e50, 2190)      # A cut
        swim(both, e100, 4900)     # B cut — must not be listed
        swim(only_b, e50, 2250)    # B cut
        swim(only_b, e100, 4950)   # B cut
        r = APIClient().get(f'/api/v1/qualifying-standards/{std.id}/qualified/', {'country': tun.id})
        self.assertEqual(r.status_code, 200)
        got = sorted((q['swimmer'], q['event'], q['cut']) for q in r.json()['qualified'])
        self.assertEqual(got, [('Both CUTS', '50 M Freestyle', 'A'),
                               ('Only B', '100 M Freestyle', 'B'),
                               ('Only B', '50 M Freestyle', 'B')])
