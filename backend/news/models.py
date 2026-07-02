from django.db import models
from core.models import Country


class Article(models.Model):
    STATUS_CHOICES = [('DRAFT', 'Draft'), ('PUBLISHED', 'Published')]

    title = models.CharField(max_length=255)
    cover_image = models.ImageField(upload_to='news/covers/', blank=True, null=True)
    body = models.TextField(blank=True, default='')
    country = models.ForeignKey(Country, on_delete=models.SET_NULL, blank=True, null=True, related_name='articles')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='DRAFT')
    published_at = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-published_at', '-created_at']

    def __str__(self):
        return self.title
