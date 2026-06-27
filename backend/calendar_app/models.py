from django.db import models
from championships.models import Championship


class CalendarEvent(models.Model):
    EVENT_TYPE_CHOICES = [
        ('CHAMPIONSHIP', 'Championship'),
        ('MEET', 'Meet'),
        ('CUSTOM', 'Custom'),
    ]
    title = models.CharField(max_length=200)
    date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='CUSTOM')
    championship = models.ForeignKey(Championship, on_delete=models.SET_NULL, blank=True, null=True, related_name='calendar_events')
    description = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f'{self.title} ({self.date})'
