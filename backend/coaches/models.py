from django.db import models
from core.models import Country


class Coach(models.Model):
    LEVEL_CHOICES = [
        ('HEAD', 'Head Coach'),
        ('ASSISTANT', 'Assistant Coach'),
        ('TECHNIQUE', 'Technique Coach'),
        ('FITNESS', 'Fitness / S&C Coach'),
        ('YOUTH', 'Youth Development Coach'),
        ('PRIVATE', 'Private Coach'),
    ]

    # Personal info
    name = models.CharField(max_length=200)
    photo = models.ImageField(upload_to='coaches/photos/', blank=True, null=True)
    nationality = models.ForeignKey(Country, on_delete=models.PROTECT, related_name='coaches')
    date_of_birth = models.DateField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, default='')

    # Professional info
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, blank=True, default='')
    years_experience = models.PositiveIntegerField(blank=True, null=True)
    current_club = models.CharField(max_length=200, blank=True, default='')
    specializations = models.CharField(max_length=500, blank=True, default='',
        help_text='Comma-separated, e.g. Sprint Freestyle, Open Water, Youth')
    certifications = models.TextField(blank=True, default='',
        help_text='One per line, e.g. ASCA Level 3, World Aquatics Coach Certificate')
    bio = models.TextField(blank=True, default='')
    achievements = models.TextField(blank=True, default='',
        help_text='Key coaching achievements, one per line')

    # CV / resume
    cv_file = models.FileField(upload_to='coaches/cvs/', blank=True, null=True,
        help_text='PDF resume / CV')

    # Contact
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    instagram = models.CharField(max_length=100, blank=True, default='')
    linkedin = models.URLField(blank=True, default='')

    # Status
    is_available = models.BooleanField(default=True,
        help_text='Currently open to new opportunities')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
