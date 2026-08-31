from django.db import models
from core.models import Country, Event
from swimmers.models import Swimmer


class ClassificationCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name_plural = 'classification categories'

    def __str__(self):
        return self.name


class Classification(models.Model):
    category = models.ForeignKey(ClassificationCategory, on_delete=models.CASCADE, related_name='classifications', blank=True, null=True)
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class SubClassification(models.Model):
    classification = models.ForeignKey(Classification, on_delete=models.CASCADE, related_name='sub_classifications')
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Championship(models.Model):
    POOL_CHOICES = [('LCM', 'Long Course (50m)'), ('SCM', 'Short Course (25m)')]
    name = models.CharField(max_length=200)
    date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    pool = models.CharField(max_length=3, choices=POOL_CHOICES)
    # Open meet vs age-group meet — shown on the calendar dropdown
    MEET_CATEGORY_CHOICES = [('OPEN', 'Open'), ('AGE_GROUP', 'Age Group')]
    meet_category = models.CharField(max_length=10, choices=MEET_CATEGORY_CHOICES, blank=True, default='')
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='championships', null=True, blank=True)
    location = models.CharField(max_length=200, blank=True, default='')
    classification_category = models.ForeignKey(ClassificationCategory, on_delete=models.SET_NULL, blank=True, null=True)
    classification = models.ForeignKey(Classification, on_delete=models.SET_NULL, blank=True, null=True)
    sub_classification = models.ForeignKey(SubClassification, on_delete=models.SET_NULL, blank=True, null=True)
    pdf_file = models.FileField(upload_to='championships/pdfs/', blank=True, null=True)
    website = models.URLField(max_length=500, blank=True, default='')
    policy_pdf = models.FileField(upload_to='championships/policies/', blank=True, null=True)
    live_results_url = models.URLField(max_length=500, blank=True, default='')
    meet_guide_pdf = models.FileField(upload_to='championships/guides/', blank=True, null=True)
    meet_photo = models.ImageField(upload_to='championships/photos/', blank=True, null=True)
    registration_url = models.URLField(max_length=500, blank=True, default='')
    # Created from the calendar for a future meet: hidden from the meets
    # list until it gets real results.
    is_calendar_only = models.BooleanField(default=False)
    # Unpublished meets (e.g. a foreign meet with a single Arab swimmer,
    # added via manual entry) feed swimmer profiles and stats only —
    # hidden from the championships list and the calendar.
    is_published = models.BooleanField(default=True)
    # National meets (e.g. Tunisian "toutes catégories" championships) that
    # award an extra open podium per event across all age categories on top
    # of the per-category podiums. Auto-detected on import when a TC
    # results file is merged into a categorized meet.
    has_open_podium = models.BooleanField(default=False)
    # Double podium for meets with foreign guest swimmers: guests keep
    # their medals from the overall ranking, and host-country swimmers
    # get their own parallel podium (e.g. a guest wins gold AND the best
    # host swimmer is national champion with a gold of their own).
    has_double_podium = models.BooleanField(default=False)
    # Tunisian TC long-course nationals: Finale B swims count for times
    # but Finale B athletes get NO medals (only Finale A and the open/TC
    # podium award). Toggled per meet in the edit form.
    b_final_no_medals = models.BooleanField(default=False)
    # Live results mode: turned on by the first session upload during the
    # meet, turned off by the admin's "Finish meet" button. While live, the
    # meet shows a LIVE badge and results grow session by session.
    is_live = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        indexes = [
            models.Index(fields=['-date']),
            models.Index(fields=['pool']),
            models.Index(fields=['country']),
            models.Index(fields=['classification']),
            models.Index(fields=['is_calendar_only', '-date']),
        ]

    def __str__(self):
        return f'{self.name} ({self.date.year})'


class ProgramItem(models.Model):
    """One event scheduled on one day of a meet's program.

    Days are 1-based and map onto the meet's date range: Day 1 is
    championship.date, Day 2 the next day, and so on. The program is
    entered by admins (manual meets and file imports alike) and shown
    on the public meet page."""
    GENDER_CHOICES = [('M', 'Men'), ('F', 'Women'), ('X', 'Mixed')]
    SESSION_CHOICES = [('HEATS', 'Heats'), ('SEMIS', 'Semifinals'), ('FINALS', 'Finals')]

    championship = models.ForeignKey(Championship, on_delete=models.CASCADE, related_name='program_items')
    day = models.PositiveSmallIntegerField(help_text='1-based day of the meet (Day 1 = start date)')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='program_items')
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, default='X')
    session = models.CharField(max_length=8, choices=SESSION_CHOICES, blank=True, default='')
    age_category = models.CharField(max_length=40, blank=True, default='',
                                    help_text='Optional age category for this line, e.g. "U14" or "13-14 years"')
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = ['championship', 'day', 'event', 'gender', 'session', 'age_category']
        ordering = ['day', 'order', 'id']
        indexes = [models.Index(fields=['championship', 'day'])]

    def __str__(self):
        return f'Day {self.day}: {self.event.name} ({self.gender}) @ {self.championship.name}'


class LiveSession(models.Model):
    """One results upload (PDF or scraped link) for one day of a live meet.

    Pure log/progress tracking for the Live panel — the actual results go
    through the normal import pipeline, so accuracy and dedup rules are
    identical to a regular import."""
    SOURCE_CHOICES = [('PDF', 'PDF upload'), ('LINK', 'Scraped link')]

    championship = models.ForeignKey(Championship, on_delete=models.CASCADE,
                                     related_name='live_sessions')
    day = models.PositiveSmallIntegerField(
        help_text='1-based day of the meet (Day 1 = start date)')
    round_summary = models.CharField(
        max_length=120, blank=True, default='',
        help_text='Rounds detected in the file, e.g. "Heats, Finals"')
    source = models.CharField(max_length=4, choices=SOURCE_CHOICES, default='PDF')
    label = models.CharField(max_length=255, blank=True, default='',
                             help_text='Filename or URL of the upload')
    results_added = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['day', 'created_at']
        indexes = [models.Index(fields=['championship', 'day'])]

    def __str__(self):
        return f'Day {self.day} session @ {self.championship.name}'


def relay_first_leg_split_cs(result, swimmer_name):
    """Return a swimmer's relay leg split in centiseconds ONLY if they swam
    the first leg of the relay, else None.

    STRICT first-leg rule: relay legs are stored in swim order, so the first
    leg is index 0 of relay_swimmers. The first leg starts from a standing
    dive (like an individual race), so its split is a valid individual time.
    Legs 2-4 are flying starts and are NOT comparable — they never count in
    records, rankings or a swimmer's individual times.

    A manually-entered leg may carry first_leg=False to mark a swimmer who did
    not swim first; such a result is saved normally but is excluded here.
    When the flag is absent (auto imports, legacy rows) the index-0 swimmer is
    treated as the first leg.
    """
    legs = result.relay_swimmers or []
    if not legs or not isinstance(legs[0], dict):
        return None
    first = legs[0]
    if (first.get('name') or '').upper() != (swimmer_name or '').upper():
        return None
    if first.get('first_leg') is False:
        return None
    st = first.get('split_time')
    if not st:
        return None
    from importer.parsers.base import parse_time_to_centiseconds
    cs = parse_time_to_centiseconds(st)
    return cs if cs and cs > 0 else None


class Result(models.Model):
    ROUND_CHOICES = [
        ('Finals', 'Finals'),
        ('Semifinals', 'Semifinals'),
        ('Prelims', 'Prelims'),
        ('Heats', 'Heats'),
        ('Consolation', 'Consolation'),
        ('', 'Unknown'),
    ]
    swimmer = models.ForeignKey(Swimmer, on_delete=models.CASCADE, related_name='results')
    championship = models.ForeignKey(Championship, on_delete=models.CASCADE, related_name='results')
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name='results')
    round_type = models.CharField(max_length=20, blank=True, default='', choices=ROUND_CHOICES)
    category = models.CharField(max_length=50, blank=True, default='', help_text='Age category / classement (e.g. Minimes, Cadets), for meets split by category')
    team = models.CharField(max_length=200, blank=True, default='', help_text='Club or national team represented at this meet')
    time_centiseconds = models.IntegerField(help_text='Time in centiseconds (e.g. 2190 = 21.90s)')
    fina_points = models.IntegerField(blank=True, null=True)
    age_at_competition = models.IntegerField(blank=True, null=True)
    relay_swimmers = models.JSONField(blank=True, null=True, help_text='List of {name, split_time} for relay results')
    splits = models.JSONField(blank=True, null=True, help_text='List of {distance, time} cumulative splits for individual results (when available in source PDF)')
    original_rank = models.PositiveIntegerField(blank=True, null=True, help_text='Rank/place from the source PDF. Medals are awarded from this rank so deleting other (e.g. non-Arab) results never promotes remaining swimmers onto the podium.')
    is_hc = models.BooleanField(default=False, help_text='Hors concours – valid time that does not count in rankings')
    is_manual = models.BooleanField(default=False, help_text='Manually entered result – excluded from automatic medal awards')
    manually_edited = models.BooleanField(default=False, help_text='An admin hand-edited this result. Re-importing the same meet must NOT overwrite its time/rank/points — manual edits always win over the automatic pipeline.')
    hc_type = models.CharField(max_length=8, blank=True, default='', help_text="Source marking for unranked swims: 'HC' or 'TLD' (time limit exceeded)")
    # Nationality the swimmer represented AT THIS MEET. Stamped at import /
    # creation and re-stamped by nationality changes (results before the
    # effective date keep the old country) — country attribution on medal
    # tables, records and rankings must use this, never swimmer.nationality.
    nationality = models.ForeignKey(Country, on_delete=models.SET_NULL, blank=True, null=True,
                                    related_name='results')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # team and time are part of the identity so a club's multiple relay
        # squads (which can share both a placeholder swimmer AND a name —
        # "MC ALGER" twice in one heats list) each keep their result; the
        # importer still dedupes individual results at application level.
        unique_together = ['swimmer', 'championship', 'event', 'round_type',
                           'category', 'team', 'time_centiseconds']
        ordering = ['time_centiseconds']
        indexes = [
            models.Index(fields=['event', 'time_centiseconds']),
            models.Index(fields=['championship']),
            models.Index(fields=['swimmer']),
            models.Index(fields=['swimmer', 'event', 'time_centiseconds']),
            models.Index(fields=['time_centiseconds']),
            models.Index(fields=['championship', 'event']),
        ]

    def save(self, *args, **kwargs):
        # Default the represented nationality to the swimmer's current one so
        # every creation path (importer, admin add, scripts) stamps it.
        if self.nationality_id is None and self.swimmer_id:
            self.nationality_id = self.swimmer.nationality_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.swimmer.name} - {self.event.name} - {self.formatted_time}'

    @property
    def formatted_time(self):
        cs = self.time_centiseconds
        minutes = cs // 6000
        seconds = (cs % 6000) // 100
        centis = cs % 100
        if minutes:
            return f'{minutes}:{seconds:02d}.{centis:02d}'
        return f'{seconds}.{centis:02d}'
