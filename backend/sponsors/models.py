from django.db import models


class SponsorTier(models.Model):
    """E.g. Main Partner, Official Partner, Official Supplier, Media Partner."""
    name = models.CharField(max_length=100, unique=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Sponsor(models.Model):
    name = models.CharField(max_length=200)
    tier = models.ForeignKey(SponsorTier, on_delete=models.SET_NULL, null=True, blank=True, related_name='sponsors')
    logo = models.ImageField(upload_to='sponsors/logos/', blank=True, null=True)
    description = models.TextField(blank=True, default='')
    website = models.URLField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name
