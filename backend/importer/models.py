from django.db import models


class ImportLog(models.Model):
    """Track import history."""
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10)  # pdf, html, xlsx
    source_format = models.CharField(max_length=50)  # splash, hytek, frmn, nat2i, excel
    meet_name = models.CharField(max_length=200, blank=True, default='')
    championship = models.ForeignKey(
        'championships.Championship', on_delete=models.SET_NULL,
        blank=True, null=True, related_name='imports'
    )
    total_results = models.IntegerField(default=0)
    created_swimmers = models.IntegerField(default=0)
    matched_swimmers = models.IntegerField(default=0)
    created_results = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='pending')  # pending, completed, failed
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file_name} - {self.status}'
