from django.db import models
from core.models import Event


class QualifyingStandard(models.Model):
    """A set of qualifying times for a competition (e.g. 2024 Olympics, 2025 Worlds)."""
    COMPETITION_TYPE_CHOICES = [
        ('olympics', 'Olympics'),
        ('world_championships', 'World Championships'),
    ]
    name = models.CharField(max_length=200, help_text='e.g. Paris 2024 Olympics')
    competition_type = models.CharField(max_length=30, choices=COMPETITION_TYPE_CHOICES)
    year = models.IntegerField()
    qualifying_period_start = models.DateField(blank=True, null=True)
    qualifying_period_end = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-year', 'name']

    def __str__(self):
        return self.name


class QualifyingTime(models.Model):
    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female')]
    CUT_CHOICES = [('A', 'A Standard'), ('B', 'B Standard')]
    POOL_CHOICES = [('LCM', 'Long Course (50m)'), ('SCM', 'Short Course (25m)')]

    standard = models.ForeignKey(QualifyingStandard, on_delete=models.CASCADE, related_name='times')
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name='qualifying_times')
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    cut = models.CharField(max_length=1, choices=CUT_CHOICES)
    pool = models.CharField(max_length=3, choices=POOL_CHOICES, default='LCM')
    time_centiseconds = models.IntegerField(help_text='Qualifying time in centiseconds')

    class Meta:
        ordering = ['event__sort_order', 'event__distance', 'gender', 'cut']
        unique_together = ['standard', 'event', 'gender', 'cut', 'pool']

    def __str__(self):
        return f'{self.standard.name} - {self.event.name} {self.get_gender_display()} {self.cut}'

    @property
    def formatted_time(self):
        cs = self.time_centiseconds
        minutes = cs // 6000
        seconds = (cs % 6000) // 100
        centis = cs % 100
        if minutes:
            return f'{minutes}:{seconds:02d}.{centis:02d}'
        return f'{seconds}.{centis:02d}'
