from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [('ADMIN', 'Admin'), ('VIEWER', 'Viewer')]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='ADMIN')


class Country(models.Model):
    REGION_CHOICES = [('ARAB', 'Arab'), ('GCC', 'GCC'), ('OTHER', 'Other')]
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=3, unique=True)
    flag_url = models.CharField(max_length=255, blank=True, default='')
    region = models.CharField(max_length=10, choices=REGION_CHOICES, default='ARAB')

    class Meta:
        verbose_name_plural = 'countries'
        ordering = ['name']

    def __str__(self):
        return self.name


class Event(models.Model):
    STROKE_CHOICES = [
        ('Freestyle', 'Freestyle'), ('Backstroke', 'Backstroke'),
        ('Butterfly', 'Butterfly'), ('Breaststroke', 'Breaststroke'),
        ('Individual Medley', 'Individual Medley'), ('Medley Relay', 'Medley Relay'),
        ('Freestyle Relay', 'Freestyle Relay'),
    ]
    name = models.CharField(max_length=100, unique=True)
    distance = models.IntegerField()
    stroke = models.CharField(max_length=30, choices=STROKE_CHOICES)
    is_relay = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'distance']

    def __str__(self):
        return self.name
