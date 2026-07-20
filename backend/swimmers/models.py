from django.db import models
from core.models import Country


class Swimmer(models.Model):
    SEX_CHOICES = [('M', 'Male'), ('F', 'Female')]
    name = models.CharField(max_length=200)
    date_of_birth = models.DateField(blank=True, null=True)
    birth_year = models.IntegerField(blank=True, null=True, help_text='Year of birth when exact DOB is unknown')
    nationality = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='swimmers')
    sex = models.CharField(max_length=1, choices=SEX_CHOICES)
    club = models.CharField(max_length=200, blank=True, default='')
    photo = models.ImageField(upload_to='swimmers/photos/', blank=True, null=True)
    is_relay_team = models.BooleanField(
        default=False,
        help_text='Placeholder row that holds relay results for a team, not a real athlete')
    is_retired = models.BooleanField(default=False)
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

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
