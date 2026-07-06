"""Recompute medals for every championship using Olympic tie rules.

Idempotent: deletes and re-awards all result-backed medals. Manually
entered medals (result is NULL) are preserved.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from championships.models import Championship
from medals.utils import recompute_medals


class Command(BaseCommand):
    help = 'Recompute all medals from results with Olympic tie handling'

    @transaction.atomic
    def handle(self, *args, **options):
        total = 0
        for champ in Championship.objects.all():
            total += recompute_medals(champ)
        self.stdout.write(self.style.SUCCESS(
            f'{total} medal(s) awarded across '
            f'{Championship.objects.count()} championship(s)'))
