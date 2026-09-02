from django.db import models
from core.models import Country, Event
from swimmers.models import Swimmer
from championships.models import Result


class Record(models.Model):
    RECORD_TYPE_CHOICES = [
        ('ARAB', 'Arab'), ('NATIONAL', 'National'), ('GCC', 'GCC'),
        ('AFRICAN', 'African'), ('ASIAN', 'Asian'),
        ('MEDITERRANEAN', 'Mediterranean'), ('ISLAMIC', 'Islamic'),
        ('WORLD', 'World'),
    ]
    POOL_CHOICES = [('LCM', 'LCM'), ('SCM', 'SCM')]
    AGE_CATEGORY_CHOICES = [
        ('OPEN', 'Open'),
        ('U10', 'U10'), ('U11', 'U11'), ('U12', 'U12'), ('U13', 'U13'),
        ('U14', 'U14'), ('U15', 'U15'), ('U16', 'U16'), ('U17', 'U17'),
        ('U18', 'U18'),
    ]
    swimmer = models.ForeignKey(Swimmer, on_delete=models.CASCADE, related_name='records')
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name='records')
    record_type = models.CharField(max_length=20, choices=RECORD_TYPE_CHOICES)
    age_category = models.CharField(max_length=10, choices=AGE_CATEGORY_CHOICES,
                                    default='OPEN')
    pool = models.CharField(max_length=3, choices=POOL_CHOICES, default='LCM')
    time_centiseconds = models.IntegerField()
    location = models.CharField(max_length=200, blank=True, default='')
    meet_name = models.CharField(max_length=200, blank=True, default='')
    country = models.ForeignKey(Country, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='manual_records')
    result_date = models.DateField()
    result = models.ForeignKey(Result, on_delete=models.SET_NULL, blank=True, null=True, related_name='records')
    is_new = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-result_date']
        indexes = [
            models.Index(fields=['swimmer']),
            models.Index(fields=['event']),
            models.Index(fields=['record_type', 'pool']),
            models.Index(fields=['event', 'record_type', 'pool']),
            models.Index(fields=['is_new']),
        ]

    def __str__(self):
        return f'{self.swimmer.name} - {self.event.name} - {self.get_record_type_display()}'

    @property
    def formatted_time(self):
        cs = self.time_centiseconds
        minutes = cs // 6000
        seconds = (cs % 6000) // 100
        centis = cs % 100
        if minutes:
            return f'{minutes}:{seconds:02d}.{centis:02d}'
        return f'{seconds}.{centis:02d}'
