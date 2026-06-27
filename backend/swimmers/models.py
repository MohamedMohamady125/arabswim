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
