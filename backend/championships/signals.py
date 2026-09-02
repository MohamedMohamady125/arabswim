"""Keep denormalised caches in sync when a Championship is edited."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from championships.models import Championship


@receiver(post_save, sender=Championship)
def sync_record_cache(sender, instance, **kwargs):
    """When a championship name/location changes, update every Record that
    was sourced from a result in this championship so the cached
    meet_name and location fields stay current."""
    from records.models import Record
    Record.objects.filter(result__championship=instance).update(
        meet_name=instance.name,
        location=instance.location,
    )
