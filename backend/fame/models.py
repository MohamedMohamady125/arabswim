from django.db import models
from core.models import Country
from swimmers.models import Swimmer


class Inductee(models.Model):
    CATEGORY_CHOICES = [
        ('LEGEND', 'Legends'),
        ('OLYMPIAN', 'Olympians'),
        ('ARAB_WINNER', 'Arabswim Awards'),
    ]

    swimmer = models.ForeignKey(Swimmer, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='hall_of_fame_entries')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='LEGEND')
    name = models.CharField(max_length=200)
    photo = models.ImageField(upload_to='fame/photos/', blank=True, null=True)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='inductees')
    era = models.CharField(max_length=50, blank=True, default='')
    inducted_year = models.IntegerField(blank=True, null=True)
    achievements = models.TextField(blank=True, default='')
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['display_order', '-inducted_year']

    def __str__(self):
        return self.name


def _new_slug():
    import secrets
    return secrets.token_urlsafe(8)


class AwardPoll(models.Model):
    """One Arabswim Awards vote (for example "Male Swimmer of the Year 2026").

    It is reached by its own link (/vote/<slug>), which is shared on social
    media. Each person votes once: see fame/voting.py.
    """
    DRAFT, OPEN, CLOSED = 'DRAFT', 'OPEN', 'CLOSED'
    STATUS_CHOICES = [(DRAFT, 'Draft'), (OPEN, 'Open'), (CLOSED, 'Closed')]

    title = models.CharField(max_length=160)
    year = models.IntegerField()
    slug = models.CharField(max_length=24, unique=True, default=_new_slug, editable=False)
    description = models.CharField(max_length=300, blank=True, default='')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=DRAFT)
    closes_at = models.DateTimeField(blank=True, null=True)
    # voters see the standings right after they vote; off = only after the winner is announced
    show_results = models.BooleanField(default=False)
    winner = models.ForeignKey('AwardNominee', on_delete=models.SET_NULL, blank=True, null=True,
                               related_name='won_polls')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-year', '-created_at']

    def __str__(self):
        return f'{self.title} ({self.year})'

    @property
    def is_open(self):
        from django.utils import timezone
        return self.status == self.OPEN and (self.closes_at is None or timezone.now() < self.closes_at)


class AwardNominee(models.Model):
    poll = models.ForeignKey(AwardPoll, on_delete=models.CASCADE, related_name='nominees')
    swimmer = models.ForeignKey(Swimmer, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='award_nominations')
    name = models.CharField(max_length=200)
    photo = models.ImageField(upload_to='fame/awards/', blank=True, null=True)
    country = models.ForeignKey(Country, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='award_nominees')
    note = models.CharField(max_length=200, blank=True, default='')
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name


class AwardVote(models.Model):
    poll = models.ForeignKey(AwardPoll, on_delete=models.CASCADE, related_name='votes')
    nominee = models.ForeignKey(AwardNominee, on_delete=models.CASCADE, related_name='votes')
    # one-way hashes: the device that voted and the network it voted from
    voter = models.CharField(max_length=64)
    network = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['poll', 'voter'], name='one_vote_per_voter')]
