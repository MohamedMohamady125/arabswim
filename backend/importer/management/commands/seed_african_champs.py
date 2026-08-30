"""
Seed the African Championships 2026 with realistic fake data.

Usage:
    python manage.py seed_african_champs
    python manage.py seed_african_champs --dry-run
"""
import random
from datetime import date

from django.core.management.base import BaseCommand
from championships.models import Championship, Result, ProgramItem
from swimmers.models import Swimmer
from events.models import Event
from countries.models import Country


# Realistic African swimmer names by country
SWIMMERS_DATA = {
    'EGY': {
        'M': [
            'Marwan ELKAMASH', 'Youssef RAMADAN', 'Ali KHALAFALLA', 'Ahmed AKRAM',
            'Abdallah ABDELRAHMAN', 'Omar ELGHAZALY', 'Karim SOBHY', 'Mohamed SAMY',
            'Seif ELHOSSEINY', 'Hassan BARAKAT', 'Mostafa SAYED', 'Tarek ANWAR',
        ],
        'F': [
            'Farida OSMAN', 'Hania MORO', 'Rawan ABDELMEGUID', 'Layla HASSAN',
            'Nour ELSHERBINI', 'Sara IBRAHIM', 'Yomna KHATER', 'Malak AHMED',
            'Hana GEORGY', 'Salma MOHAMED', 'Dina MOSTAFA', 'Aya KHALIL',
        ],
    },
    'TUN': {
        'M': [
            'Ahmed JAOUADI', 'Ayoub HAFNAOUI', 'Mohamed KHALIL JENDOUBI',
            'Aziz DHOUIB', 'Wassim ELLOUMI', 'Rami TRABELSI',
            'Yassine FERJANI', 'Hamza BELHAJ', 'Slim KHELIL', 'Nabil BOUGUERRA',
        ],
        'F': [
            'Hela BELHAJ', 'Nesrine HAFNAOUI', 'Mariem TRABELSI',
            'Ines JELJELI', 'Syrine BOUSAID', 'Rania SASSI',
            'Fatma KARRAY', 'Amira TOUIHRI', 'Yasmine MAAREF', 'Safa OUESLATI',
        ],
    },
    'ALG': {
        'M': [
            'Jaoued SYOUD', 'Abdallah ARDJOUNE', 'Anis DJABALLAH',
            'Oussama SAHNOUNE', 'Mohamed LOUNIS', 'Yacine BENALI',
            'Riad BOUDINA', 'Kamel MEDJBER', 'Hichem SALHI', 'Sofiane AMARA',
        ],
        'F': [
            'Amel MELIH', 'Rima BENKHEDDA', 'Nesrine BOUDRAA',
            'Sabrina SAIBI', 'Kenza BARKAT', 'Djamila BOUDAOUD',
            'Hadjer TOUATI', 'Meriem BELKACEMI', 'Imane DERRADJI', 'Lamia FERHAT',
        ],
    },
    'MAR': {
        'M': [
            'Samy BOUTOUIL', 'Hamza BENABBAD', 'Yassine RAHMANI',
            'Omar FILALI', 'Mehdi ENNACIRI', 'Ayoub KADDOURI',
            'Soufiane BOUZIDI', 'Amine ELGHOUATE', 'Rachid LAARABI', 'Mouad DRAOUI',
        ],
        'F': [
            'Sara LAALOU', 'Imane OUAHABI', 'Dounia ZITOUNI',
            'Ghita BENCHEKROUN', 'Nada FATHI', 'Houda BAKKALI',
            'Zineb AMRANI', 'Khadija ELHARRAK', 'Wiam BENHIMA', 'Meriam SAIDI',
        ],
    },
    'RSA': {
        'M': [
            'Matthew SATES', 'Pieter COETZE', 'Chad LE CLOS',
            'Liam VAN NIEKERK', 'Ryan SOBHEE', 'Alaric BASSON',
            'Michael HOULIE', 'Keagan SOBHEE', 'Ethan DU PREEZ', 'Jason BRENT',
        ],
        'F': [
            'Tatjana SMITH', 'Kaylene CORBETT', 'Aimee CANNY',
            'Rebecca MEDER', 'Dune COETZEE', 'Emma SOBHEE',
            'Lara VAN NIEKERK', 'Erin GALLAGHER', 'Michaela VALENTINE', 'Jessica SOBHEE',
        ],
    },
    'NGR': {
        'M': [
            'Unihez OBILOR', 'Ademola MUSTAPHA', 'Chukwuemeka OBIORA',
            'Ifeanyi OKEKE', 'Tunde AKINOLA', 'Emmanuel OGBONNA',
        ],
        'F': [
            'Oluwadamilola OGUNBANWO', 'Abosede OKUNOLA', 'Chidinma NWOSU',
            'Temiloluwa BANKOLE', 'Adaeze IGWE', 'Folake ADEYEMI',
        ],
    },
    'ANG': {
        'M': [
            'Jose LOPES', 'Miguel XAVIER', 'Paulo FERNANDES',
            'Ricardo SOARES', 'Henrique SANTOS', 'Daniel COSTA',
        ],
        'F': [
            'Ana SANTOS', 'Maria FERNANDES', 'Isabel XAVIER',
            'Catarina SOARES', 'Beatriz COSTA', 'Joana LOPES',
        ],
    },
    'MOZ': {
        'M': [
            'Ralph SOUZA', 'Jose CRAVEIRINHA', 'Manuel SITOE',
        ],
        'F': [
            'Anisha FERNANDES', 'Raquel SITOE', 'Jessica CHIVAMBO',
        ],
    },
    'SEN': {
        'M': [
            'Malick FALL', 'Ousmane DIALLO', 'Moussa NDIAYE',
            'Ibrahima SECK', 'Abdoulaye DIOP',
        ],
        'F': [
            'Fatou DIALLO', 'Aminata NDIAYE', 'Aissatou FALL',
            'Mariama SECK', 'Ndeye DIOP',
        ],
    },
    'KEN': {
        'M': [
            'Jason DUNFORD', 'Davis KINYUA', 'Brian WACHIRA',
        ],
        'F': [
            'Emily MUTETI', 'Maria KAMAU', 'Joyce ODHIAMBO',
        ],
    },
}

# Base times in centiseconds for each event (world-class African level)
# Format: event_name -> (men_base, women_base, variance_pct)
BASE_TIMES = {
    '50 M Freestyle':            (2180, 2450, 8),
    '100 M Freestyle':           (4780, 5350, 8),
    '200 M Freestyle':           (10500, 11700, 8),
    '400 M Freestyle':           (22800, 25200, 8),
    '800 M Freestyle':           (47500, 51000, 8),
    '1500 M Freestyle':          (90000, 97000, 8),
    '50 M Backstroke':           (2480, 2780, 8),
    '100 M Backstroke':          (5300, 5900, 8),
    '200 M Backstroke':          (11500, 12800, 8),
    '50 M Breaststroke':         (2700, 3050, 8),
    '100 M Breaststroke':        (5950, 6600, 8),
    '200 M Breaststroke':        (13000, 14400, 8),
    '50 M Butterfly':            (2300, 2600, 8),
    '100 M Butterfly':           (5100, 5700, 8),
    '200 M Butterfly':           (11300, 12600, 8),
    '200 M Individual Medley':   (11800, 13000, 8),
    '400 M Individual Medley':   (25500, 27800, 8),
}

# Events to schedule per day (realistic African champs program)
PROGRAM = {
    1: [  # Day 1: 25 Aug
        ('400 M Freestyle', 'M'), ('400 M Freestyle', 'F'),
        ('100 M Breaststroke', 'M'), ('100 M Breaststroke', 'F'),
        ('100 M Butterfly', 'M'), ('100 M Butterfly', 'F'),
        ('200 M Individual Medley', 'M'), ('200 M Individual Medley', 'F'),
    ],
    2: [  # Day 2: 26 Aug
        ('200 M Freestyle', 'M'), ('200 M Freestyle', 'F'),
        ('100 M Backstroke', 'M'), ('100 M Backstroke', 'F'),
        ('50 M Breaststroke', 'M'), ('50 M Breaststroke', 'F'),
    ],
    3: [  # Day 3: 27 Aug
        ('50 M Freestyle', 'M'), ('50 M Freestyle', 'F'),
        ('200 M Butterfly', 'M'), ('200 M Butterfly', 'F'),
        ('200 M Breaststroke', 'M'), ('200 M Breaststroke', 'F'),
    ],
    4: [  # Day 4: 28 Aug
        ('100 M Freestyle', 'M'), ('100 M Freestyle', 'F'),
        ('200 M Backstroke', 'M'), ('200 M Backstroke', 'F'),
        ('50 M Butterfly', 'M'), ('50 M Butterfly', 'F'),
    ],
    5: [  # Day 5: 29 Aug
        ('800 M Freestyle', 'F'), ('1500 M Freestyle', 'M'),
        ('50 M Backstroke', 'M'), ('50 M Backstroke', 'F'),
        ('400 M Individual Medley', 'M'), ('400 M Individual Medley', 'F'),
    ],
    6: [  # Day 6: 30 Aug — results only for days 1-5 (today), program for 6-7
        ('800 M Freestyle', 'M'),
        ('1500 M Freestyle', 'F'),
    ],
    7: [],  # Day 7: 31 Aug — closing, relays
}


def _generate_time(base_cs, variance_pct, rank_offset):
    """Generate a realistic time with variance based on rank."""
    # Top swimmers are closer to base, lower-ranked are slower
    slowdown = rank_offset * (base_cs * variance_pct / 100) / 20
    noise = random.gauss(0, base_cs * 0.005)  # tiny random jitter
    return max(int(base_cs + slowdown + noise), base_cs - 50)


def _format_cs(cs):
    """Centiseconds → '1:23.45' or '23.45'."""
    mins = cs // 6000
    secs = (cs % 6000) / 100
    if mins:
        return f'{mins}:{secs:05.2f}'
    return f'{secs:.2f}'


class Command(BaseCommand):
    help = 'Seed African Championships 2026 with realistic fake data'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry = options['dry_run']
        random.seed(42)  # reproducible

        # Find the championship
        try:
            champ = Championship.objects.get(
                name__icontains='african',
                date__year=2026,
            )
        except Championship.DoesNotExist:
            self.stderr.write('African Championships 2026 not found')
            return
        except Championship.MultipleObjectsReturned:
            champ = Championship.objects.filter(
                name__icontains='african',
                date__year=2026,
            ).order_by('-date').first()

        self.stdout.write(f'Championship: {champ.name} (id={champ.id})')

        # Check for existing results
        existing = Result.objects.filter(championship=champ).count()
        if existing > 0:
            self.stdout.write(self.style.WARNING(
                f'Already has {existing} results — clearing them first'))
            if not dry:
                from medals.models import Medal
                Medal.objects.filter(result__championship=champ).delete()
                Result.objects.filter(championship=champ).delete()
                ProgramItem.objects.filter(championship=champ).delete()

        # Load countries — create non-Arab African ones if needed
        countries = {}
        for code in SWIMMERS_DATA:
            c = Country.objects.filter(code=code).first()
            if not c:
                COUNTRY_NAMES = {
                    'RSA': 'South Africa', 'NGR': 'Nigeria', 'ANG': 'Angola',
                    'MOZ': 'Mozambique', 'SEN': 'Senegal', 'KEN': 'Kenya',
                }
                if not dry:
                    c = Country.objects.create(
                        code=code,
                        name=COUNTRY_NAMES.get(code, code),
                        region='OTHER',
                    )
                    self.stdout.write(f'  Created country: {c.name} ({c.code})')
                else:
                    self.stdout.write(f'  Would create country: {code}')
            countries[code] = c

        # Load events
        events = {}
        for ev in Event.objects.all():
            events[ev.name] = ev

        # Create or find swimmers
        swimmer_objs = {}  # (code, name) -> Swimmer
        for code, genders in SWIMMERS_DATA.items():
            country = countries.get(code)
            for sex, names in genders.items():
                for name in names:
                    sw = Swimmer.objects.filter(
                        name__iexact=name, is_relay_team=False).first()
                    if not sw and not dry:
                        sw = Swimmer.objects.create(
                            name=name,
                            sex=sex,
                            nationality=country,
                            birth_year=random.randint(1998, 2007),
                        )
                    swimmer_objs[(code, name)] = sw

        self.stdout.write(f'  Swimmers ready: {len(swimmer_objs)}')

        # Build pool of swimmers per gender
        men = []
        women = []
        for code, genders in SWIMMERS_DATA.items():
            for name in genders.get('M', []):
                sw = swimmer_objs.get((code, name))
                if sw:
                    men.append((code, sw))
            for name in genders.get('F', []):
                sw = swimmer_objs.get((code, name))
                if sw:
                    women.append((code, sw))

        # Assign swimmer strengths (consistent across events)
        swimmer_rank = {}
        for pool in [men, women]:
            random.shuffle(pool)
            for i, (code, sw) in enumerate(pool):
                # Top countries get a bonus
                bonus = 0
                if code in ('RSA', 'EGY', 'TUN'):
                    bonus = -3
                elif code in ('ALG', 'MAR'):
                    bonus = -1
                swimmer_rank[sw.id] = max(0, i + bonus)

        results_created = 0
        program_created = 0

        # Only create results for days 1-5 (days that have passed)
        # Days 6-7 get program only (future days)
        for day, day_events in PROGRAM.items():
            for order, (event_name, gender) in enumerate(day_events, 1):
                ev = events.get(event_name)
                if not ev:
                    self.stdout.write(self.style.WARNING(f'  Event not found: {event_name}'))
                    continue

                # Create program item
                if not dry:
                    ProgramItem.objects.create(
                        championship=champ,
                        day=day,
                        event=ev,
                        gender=gender,
                        session='Finals',
                        order=order,
                    )
                program_created += 1

                # Only create results for days 1-5
                if day > 5:
                    continue

                base_times = BASE_TIMES.get(event_name)
                if not base_times:
                    continue

                base_m, base_f, var = base_times
                base = base_m if gender == 'M' else base_f
                pool = men if gender == 'M' else women

                # Pick 12-20 swimmers for this event
                n_swimmers = min(len(pool), random.randint(12, 20))
                # Sort by rank to pick top + some random
                sorted_pool = sorted(pool, key=lambda x: swimmer_rank.get(x[1].id, 99))
                # Top 8 always + random selection from rest
                top = sorted_pool[:8]
                rest = sorted_pool[8:]
                random.shuffle(rest)
                extra = rest[:n_swimmers - 8]
                event_swimmers = top + extra

                # Generate times and sort
                timed = []
                for code, sw in event_swimmers:
                    rank_off = swimmer_rank.get(sw.id, 10)
                    t = _generate_time(base, var, rank_off)
                    timed.append((t, code, sw))

                timed.sort(key=lambda x: x[0])

                for rank, (time_cs, code, sw) in enumerate(timed, 1):
                    if not dry:
                        Result.objects.create(
                            swimmer=sw,
                            championship=champ,
                            event=ev,
                            round_type='Finals',
                            time_centiseconds=time_cs,
                            fina_points=0,
                            nationality=countries.get(code),
                            original_rank=rank,
                        )
                    results_created += 1

        verb = 'Would create' if dry else 'Created'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {results_created} results + {program_created} program items'))

        # Recompute FINA points and medals
        if not dry:
            self.stdout.write('  Recomputing FINA points...')
            from importer.parsers.base import compute_fina_points
            for r in Result.objects.filter(championship=champ):
                if r.time_centiseconds and r.time_centiseconds > 0:
                    pts = compute_fina_points(
                        r.event.name, r.swimmer.sex or 'M',
                        r.time_centiseconds, champ.pool or 'LCM')
                    if pts != r.fina_points:
                        r.fina_points = pts
                        r.save(update_fields=['fina_points'])

            self.stdout.write('  Recomputing medals...')
            from medals.utils import recompute_medals
            medals = recompute_medals(champ)
            self.stdout.write(self.style.SUCCESS(f'  {medals} medals awarded'))

            # Mark as live
            if not champ.is_live:
                champ.is_live = True
                champ.is_published = True
                champ.save(update_fields=['is_live', 'is_published'])
                self.stdout.write('  Marked as LIVE + published')
