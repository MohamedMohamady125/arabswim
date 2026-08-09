from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('ADMIN', 'Admin'),
        ('ATHLETE', 'Athlete'),
        ('CLUB', 'Club'),
        ('FEDERATION', 'Federation'),
        ('VIEWER', 'Viewer'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='VIEWER')
    swimmer = models.OneToOneField(
        'swimmers.Swimmer', null=True, blank=True, on_delete=models.SET_NULL, related_name='account'
    )
    team = models.ForeignKey(
        'teams.Team', null=True, blank=True, on_delete=models.SET_NULL, related_name='accounts'
    )
    country = models.ForeignKey(
        'core.Country', null=True, blank=True, on_delete=models.SET_NULL, related_name='federation_accounts'
    )


def claim_document_path(instance, filename):
    import uuid
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f'claims/ids/{uuid.uuid4().hex}.{ext}'


class ProfileClaim(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('DECLINED', 'Declined')]
    user = models.ForeignKey('core.User', on_delete=models.CASCADE, related_name='claims')
    swimmer = models.ForeignKey('swimmers.Swimmer', on_delete=models.CASCADE, related_name='claims')
    id_document = models.ImageField(upload_to=claim_document_path)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        'core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_claims'
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} → {self.swimmer} ({self.status})'


class SiteFeature(models.Model):
    """Launch toggles: admin can hide whole site sections until they're ready."""
    key = models.CharField(max_length=40, unique=True)
    enabled = models.BooleanField(default=True)

    def __str__(self):
        return f'{self.key}: {"on" if self.enabled else "off"}'


class Country(models.Model):
    REGION_CHOICES = [('ARAB', 'Arab'), ('GCC', 'GCC'), ('OTHER', 'Other')]
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=3, unique=True)
    flag_url = models.CharField(max_length=255, blank=True, default='')
    region = models.CharField(max_length=10, choices=REGION_CHOICES, default='ARAB')

    class Meta:
        verbose_name_plural = 'countries'
        ordering = ['name']

    def __str__(self):
        return self.name


class Event(models.Model):
    STROKE_CHOICES = [
        ('Freestyle', 'Freestyle'), ('Backstroke', 'Backstroke'),
        ('Butterfly', 'Butterfly'), ('Breaststroke', 'Breaststroke'),
        ('Individual Medley', 'Individual Medley'), ('Medley Relay', 'Medley Relay'),
        ('Freestyle Relay', 'Freestyle Relay'),
    ]
    name = models.CharField(max_length=100, unique=True)
    distance = models.IntegerField()
    stroke = models.CharField(max_length=30, choices=STROKE_CHOICES)
    is_relay = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'distance']

    def __str__(self):
        return self.name
