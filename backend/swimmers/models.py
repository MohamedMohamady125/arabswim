from django.db import models
from core.models import Country


class Swimmer(models.Model):
    SEX_CHOICES = [('M', 'Male'), ('F', 'Female')]
    name = models.CharField(max_length=200)
    date_of_birth = models.DateField(blank=True, null=True)
    birth_year = models.IntegerField(blank=True, null=True, help_text='Year of birth when exact DOB is unknown')
    # Null when the source meet file carries no nationality information at
    # all — better no nationality than a wrong one polluting records/rankings.
    nationality = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='swimmers', null=True, blank=True)
    sex = models.CharField(max_length=1, choices=SEX_CHOICES)
    club = models.CharField(max_length=200, blank=True, default='')
    photo = models.ImageField(upload_to='swimmers/photos/', blank=True, null=True)
    is_relay_team = models.BooleanField(
        default=False,
        help_text='Placeholder row that holds relay results for a team, not a real athlete')
    is_retired = models.BooleanField(default=False)
    manually_edited = models.BooleanField(
        default=False,
        help_text='An admin hand-edited this swimmer. Re-imports must NOT '
                  'overwrite edited fields (e.g. current club) — manual edits '
                  'always win over the automatic pipeline.')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    instagram_url = models.URLField(blank=True, default='')
    facebook_url = models.URLField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['nationality']),
            models.Index(fields=['sex']),
            models.Index(fields=['is_relay_team']),
            models.Index(fields=['nationality', 'sex']),
        ]

    def __str__(self):
        return self.name

    @property
    def age(self):
        from datetime import date
        today = date.today()
        if self.date_of_birth:
            return today.year - self.date_of_birth.year - (
                (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
            )
        if self.birth_year:
            return today.year - self.birth_year
        return None


class SwimmerNickname(models.Model):
    swimmer = models.ForeignKey(Swimmer, on_delete=models.CASCADE, related_name='nicknames')
    nickname = models.CharField(max_length=100)

    class Meta:
        unique_together = ['swimmer', 'nickname']

    def __str__(self):
        return self.nickname


class NationalityChange(models.Model):
    swimmer = models.ForeignKey(Swimmer, on_delete=models.CASCADE, related_name='nationality_changes')
    from_country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='+', null=True, blank=True,
                                     help_text='Previous nationality (null if first known nationality)')
    to_country = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='+')
    effective_date = models.DateField(help_text='Date the nationality change took effect')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['effective_date']

    def __str__(self):
        if self.from_country:
            return f'{self.swimmer.name}: {self.from_country.name} → {self.to_country.name} ({self.effective_date})'
        return f'{self.swimmer.name}: {self.to_country.name} (initial, {self.effective_date})'


def restamp_result_nationalities(swimmer):
    """Rebuild per-result (and per-medal) nationality from the swimmer's
    NationalityChange timeline: each swim carries the country the swimmer
    represented at the meet's date. No recorded changes → current nationality."""
    from championships.models import Result
    from medals.models import Medal

    changes = list(swimmer.nationality_changes.order_by('effective_date', 'id'))

    def country_at(meet_date):
        if not changes or meet_date is None:
            return swimmer.nationality_id
        country_id = swimmer.nationality_id  # after the last change
        for ch in changes:
            if meet_date < ch.effective_date:
                return ch.from_country_id or swimmer.nationality_id
            country_id = ch.to_country_id
        return country_id

    for r in Result.objects.filter(swimmer=swimmer).select_related('championship'):
        country_id = country_at(r.championship.date)
        if r.nationality_id != country_id:
            r.nationality_id = country_id
            r.save(update_fields=['nationality'])

    for m in Medal.objects.filter(swimmer=swimmer).select_related('championship', 'result'):
        # Relay medals keep the relay result's (team's) country
        if m.result_id and m.result.swimmer_id != swimmer.id:
            continue
        country_id = country_at(m.championship.date)
        if m.nationality_id != country_id:
            m.nationality_id = country_id
            m.save(update_fields=['nationality'])
