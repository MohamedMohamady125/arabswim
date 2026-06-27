from django.db import models
from core.models import Country


class Team(models.Model):
    name = models.CharField(max_length=200, unique=True)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='teams')
    logo = models.ImageField(upload_to='teams/logos/', blank=True, null=True)
    banner = models.ImageField(upload_to='teams/banners/', blank=True, null=True)
    founded_year = models.IntegerField(blank=True, null=True)
    website = models.URLField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    is_national_team = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Trophy(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='trophies')
    name = models.CharField(max_length=200)
    year = models.IntegerField()

    class Meta:
        ordering = ['-year']
        verbose_name_plural = 'trophies'

    def __str__(self):
        return f'{self.name} ({self.year})'
