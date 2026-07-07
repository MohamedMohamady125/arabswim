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
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='championships')
    location = models.CharField(max_length=200, blank=True, default='')
    classification_category = models.ForeignKey(ClassificationCategory, on_delete=models.SET_NULL, blank=True, null=True)
    classification = models.ForeignKey(Classification, on_delete=models.SET_NULL, blank=True, null=True)
    sub_classification = models.ForeignKey(SubClassification, on_delete=models.SET_NULL, blank=True, null=True)
    pdf_file = models.FileField(upload_to='championships/pdfs/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.name} ({self.date.year})'


class Result(models.Model):
    ROUND_CHOICES = [
        ('Finals', 'Finals'),
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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # team is part of the identity so a club's multiple relay squads
        # ("MC ALGER 1", "MC ALGER 2") can each keep their result; the
        # importer still dedupes individual results at application level.
        unique_together = ['swimmer', 'championship', 'event', 'round_type', 'category', 'team']
        ordering = ['time_centiseconds']
        indexes = [
            models.Index(fields=['event', 'time_centiseconds']),
            models.Index(fields=['championship']),
        ]

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
