from django.db import models


class PageView(models.Model):
    """One tracked page view, sent by the frontend on every route change.

    Raw rows (no user accounts, no IPs stored) — visitors are identified by
    a random id the browser keeps in localStorage, sessions by one kept in
    sessionStorage, so uniques/returning visitors can be counted without
    any personal data."""
    DEVICE_CHOICES = [('desktop', 'Desktop'), ('mobile', 'Mobile'), ('tablet', 'Tablet')]

    ts = models.DateTimeField(auto_now_add=True, db_index=True)
    path = models.CharField(max_length=300)
    visitor = models.CharField(max_length=64, help_text='Anonymous long-lived browser id')
    session = models.CharField(max_length=64, help_text='Anonymous per-tab-session id')
    referrer = models.CharField(max_length=300, blank=True, default='',
                                help_text='External referrer domain ("" = direct)')
    device = models.CharField(max_length=10, choices=DEVICE_CHOICES, default='desktop')
    browser = models.CharField(max_length=30, blank=True, default='')
    country = models.CharField(max_length=64, blank=True, default='',
                               help_text='Visitor country from the CDN geo header, when present')
    is_new_visitor = models.BooleanField(default=False, help_text='First page view ever from this browser')

    class Meta:
        indexes = [
            models.Index(fields=['ts', 'path']),
            models.Index(fields=['ts', 'visitor']),
            models.Index(fields=['path']),
        ]

    def __str__(self):
        return f'{self.ts:%Y-%m-%d %H:%M} {self.path}'
