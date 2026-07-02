from django.db import models
from championships.models import Championship
from swimmers.models import Swimmer


class Album(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    championship = models.ForeignKey(Championship, on_delete=models.SET_NULL, blank=True, null=True,
                                     related_name='albums')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class MediaItem(models.Model):
    MEDIA_TYPE_CHOICES = [('PHOTO', 'Photo'), ('VIDEO', 'Video')]

    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name='items')
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default='PHOTO')
    image = models.ImageField(upload_to='media_items/', blank=True, null=True)
    video_url = models.URLField(blank=True, default='')
    caption = models.CharField(max_length=255, blank=True, default='')
    swimmer = models.ForeignKey(Swimmer, on_delete=models.SET_NULL, blank=True, null=True,
                                related_name='media_items')
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.media_type} in {self.album_id}'
