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


class ScrapeJob(models.Model):
    """One scrape of a federation Hy-Tek HTML results site → clean Excel."""
    url = models.URLField(max_length=500)
    meet_name = models.CharField(max_length=255, blank=True, default='')
    date_text = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=20, default='pending')  # pending, running, done, failed
    progress = models.CharField(max_length=100, blank=True, default='')
    error = models.TextField(blank=True, default='')
    total_events = models.IntegerField(default=0)
    total_results = models.IntegerField(default=0)
    rows = models.JSONField(default=list, blank=True)
    name_stats = models.JSONField(default=dict, blank=True)  # heats-PDF name repair
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.meet_name or self.url} - {self.status}'


class ImportJob(models.Model):
    """One background confirm-import run (big meets exceed request timeouts)."""
    meet_name = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, default='pending')  # pending, running, done, failed
    progress = models.CharField(max_length=200, blank=True, default='')
    error = models.TextField(blank=True, default='')
    result = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.meet_name} - {self.status}'
