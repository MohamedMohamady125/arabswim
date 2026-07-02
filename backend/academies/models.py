from django.db import models
from core.models import Country


class Academy(models.Model):
    name = models.CharField(max_length=200)
    country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='academies')
    city = models.CharField(max_length=100, blank=True, default='')
    logo = models.ImageField(upload_to='academies/logos/', blank=True, null=True)
    description = models.TextField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    website = models.URLField(blank=True, default='')
    instagram = models.CharField(max_length=100, blank=True, default='')
    address = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'academies'

    def __str__(self):
        return self.name
