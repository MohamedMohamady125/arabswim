from django.db import models


class PredictionEntry(models.Model):
    """One swimmer entered in one event of an upcoming championship.

    Presence of any entries for a championship switches its prediction
    from the automatic EARLY field to the OFFICIAL entry list."""
    championship = models.ForeignKey(
        'championships.Championship', on_delete=models.CASCADE, related_name='prediction_entries')
    swimmer = models.ForeignKey(
        'swimmers.Swimmer', on_delete=models.CASCADE, related_name='prediction_entries')
    event = models.ForeignKey(
        'core.Event', on_delete=models.PROTECT, related_name='prediction_entries')
    entry_time_cs = models.IntegerField(
        blank=True, null=True, help_text='Official entry time in centiseconds; falls back to season best')
    withdrawn = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['championship', 'swimmer', 'event']
        indexes = [models.Index(fields=['championship', 'event'])]

    def __str__(self):
        return f'{self.swimmer.name} - {self.event.name} @ {self.championship.name}'


class PredictionAgeGroup(models.Model):
    """Age category contested at an age-group / youth championship.

    When any groups exist for a championship, every event is predicted
    separately per group and swimmers are placed by their age in the
    meet year (meet year minus birth year, the standard swimming
    age-group convention). Meets with no groups behave as open meets."""
    championship = models.ForeignKey(
        'championships.Championship', on_delete=models.CASCADE, related_name='prediction_age_groups')
    label = models.CharField(max_length=40, help_text='e.g. "13-14" or "Juniors"')
    min_age = models.PositiveSmallIntegerField(blank=True, null=True)
    max_age = models.PositiveSmallIntegerField(blank=True, null=True)

    class Meta:
        unique_together = ['championship', 'label']
        ordering = ['min_age', 'max_age', 'label']

    def __str__(self):
        return f'{self.label} @ {self.championship.name}'


class PredictionSnapshot(models.Model):
    STAGE_CHOICES = [('EARLY', 'Early prediction'), ('OFFICIAL', 'Official entry list')]

    championship = models.OneToOneField(
        'championships.Championship', on_delete=models.CASCADE, related_name='prediction_snapshot')
    data = models.JSONField(default=dict)
    previous_data = models.JSONField(default=dict, blank=True)
    stage = models.CharField(max_length=10, choices=STAGE_CHOICES, default='EARLY')
    computed_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Prediction: {self.championship.name} ({self.stage})'
