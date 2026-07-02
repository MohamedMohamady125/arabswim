from django.db import models
from core.models import Country
from swimmers.models import Swimmer


class Inductee(models.Model):
    swimmer = models.ForeignKey(Swimmer, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='hall_of_fame_entries')
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
