from django.db import models
from core.models import Country


class Listing(models.Model):
    CATEGORY_CHOICES = [
        ('SUITS', 'Suits'), ('GOGGLES', 'Goggles'), ('TRAINING_GEAR', 'Training Gear'),
        ('APPAREL', 'Apparel'), ('ELECTRONICS', 'Electronics'), ('OTHER', 'Other'),
    ]
    CONDITION_CHOICES = [('NEW', 'New'), ('USED', 'Used')]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'), ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'), ('SOLD', 'Sold'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    currency = models.CharField(max_length=10, default='USD')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default='USED')
    seller_name = models.CharField(max_length=200, blank=True, default='')
    seller_contact = models.CharField(max_length=200, blank=True, default='')
    country = models.ForeignKey(Country, on_delete=models.SET_NULL, blank=True, null=True, related_name='listings')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ListingImage(models.Model):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='market/listings/')
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
