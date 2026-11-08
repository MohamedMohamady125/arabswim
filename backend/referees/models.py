from django.db import models
from core.models import Country


class Referee(models.Model):
    """Swimming official, mirroring the Coach directory (user rule 2026-11-08:
    the Referees section works exactly like Coaches)."""
    ROLE_CHOICES = [
        ('REFEREE', 'Referee'),
        ('STARTER', 'Starter'),
        ('STROKE_JUDGE', 'Judge of Stroke'),
        ('TURN_INSPECTOR', 'Inspector of Turns'),
        ('CHIEF_TIMEKEEPER', 'Chief Timekeeper'),
        ('CLERK', 'Clerk of Course'),
    ]

    # Personal info
    name = models.CharField(max_length=200)
    photo = models.ImageField(upload_to='referees/photos/', blank=True, null=True)
    nationality = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='referees')
    date_of_birth = models.DateField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, default='')

    # Professional info
    level = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True, default='')
    years_experience = models.PositiveIntegerField(blank=True, null=True)
    organization = models.CharField(max_length=200, blank=True, default='',
        help_text='Federation, club or committee they officiate for')
    specializations = models.CharField(max_length=500, blank=True, default='',
        help_text='Comma-separated, e.g. Pool, Open Water, Para Swimming')
    certifications = models.TextField(blank=True, default='',
        help_text='One per line, e.g. World Aquatics Referees List, National Grade A')
    bio = models.TextField(blank=True, default='')
    achievements = models.TextField(blank=True, default='',
        help_text='Key officiating appointments, one per line')

    # CV / resume
    cv_file = models.FileField(upload_to='referees/cvs/', blank=True, null=True,
        help_text='PDF resume / CV')

    # Contact
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    instagram = models.CharField(max_length=100, blank=True, default='')
    linkedin = models.URLField(blank=True, default='')

    # Status
    is_available = models.BooleanField(default=True,
        help_text='Currently open to officiating appointments')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
