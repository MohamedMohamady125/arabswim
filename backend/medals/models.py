from django.db import models
from swimmers.models import Swimmer
from championships.models import Championship, Result
from core.models import Event


class Medal(models.Model):
    MEDAL_CHOICES = [('GOLD', 'Gold'), ('SILVER', 'Silver'), ('BRONZE', 'Bronze')]
    swimmer = models.ForeignKey(Swimmer, on_delete=models.CASCADE, related_name='medals')
    championship = models.ForeignKey(Championship, on_delete=models.CASCADE, related_name='medals')
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name='medals')
    medal_type = models.CharField(max_length=10, choices=MEDAL_CHOICES)
    result = models.ForeignKey(Result, on_delete=models.SET_NULL, blank=True, null=True)
    # CATEGORY: age-category podium (default). OPEN: the extra open/TC
    # ("toutes catégories") podium some national meets award per event
    # across all age groups — the same swim can earn both.
    SCOPE_CHOICES = [('CATEGORY', 'Category'), ('OPEN', 'Open')]
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES, default='CATEGORY')

    class Meta:
        ordering = ['championship', 'event']
        indexes = [
            models.Index(fields=['swimmer']),
            models.Index(fields=['championship']),
            models.Index(fields=['medal_type']),
            models.Index(fields=['championship', 'medal_type']),
        ]

    def __str__(self):
        return f'{self.swimmer.name} - {self.get_medal_type_display()} - {self.event.name}'
