"""Canonicalize relay event names.

Imports used to store relay events under the raw parsed heading, so the
same relay exists several times: '4x100 M Freestyle Relay' vs
'... Relay Men' vs '4×100 M Medley Relay' (unicode ×) vs garbled strokes
('4 na ges'). The UI shows gender from the team's sex, so gender words in
the event name are redundant and split the data.

This command renames each relay event to its canonical form (gender words
stripped, 'Mixed' kept, ×→x, stroke garbling fixed) and merges duplicates:
results, records and medals move to the surviving event; clashing results
keep the better time. Idempotent.
"""
import re

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from core.models import Event
from championships.models import Result
from records.models import Record
from medals.models import Medal

_GENDER_RE = re.compile(
    r'\b(men|women|boys|girls|messieurs|dames|garcons|garçons|filles|hommes|femmes)\b',
    re.IGNORECASE)
_MIXED_RE = re.compile(r'\b(mixed|mixtes?)\b', re.IGNORECASE)


def canonical_name(name):
    n = name.replace('×', 'x')
    n = re.sub(r'4\s*na\s*ges|quatre\s*nages', 'Medley', n, flags=re.IGNORECASE)
    n = re.sub(r'individual medley relay', 'Medley Relay', n, flags=re.IGNORECASE)
    mixed = bool(_MIXED_RE.search(n))
    n = _MIXED_RE.sub(' ', _GENDER_RE.sub(' ', n))
    n = re.sub(r'\s+', ' ', n).strip()
    return f'{n} Mixed' if mixed else n


class Command(BaseCommand):
    help = 'Rename/merge relay events into one canonical, gender-less name each'

    @transaction.atomic
    def handle(self, *args, **options):
        renamed = merged = 0
        relays = Event.objects.filter(
            Q(is_relay=True) | Q(name__icontains='relay')).order_by('id')

        for ev in relays:
            target_name = canonical_name(ev.name)
            if target_name == ev.name:
                continue

            target = Event.objects.filter(
                name__iexact=target_name).exclude(id=ev.id).first()
            if target is None:
                self.stdout.write(f'RENAME  {ev.name!r} -> {target_name!r}')
                ev.name = target_name
                ev.save(update_fields=['name'])
                renamed += 1
                continue

            self.stdout.write(f'MERGE   {ev.name!r} -> {target.name!r}')
            for r in Result.objects.filter(event=ev):
                clash = Result.objects.filter(
                    swimmer=r.swimmer, championship=r.championship,
                    event=target, round_type=r.round_type,
                    category=r.category,
                ).first()
                if clash:
                    if r.time_centiseconds < clash.time_centiseconds:
                        clash.time_centiseconds = r.time_centiseconds
                        clash.fina_points = r.fina_points or clash.fina_points
                        clash.save(update_fields=['time_centiseconds', 'fina_points'])
                    Medal.objects.filter(result=r).update(result=clash, event=target)
                    r.delete()
                else:
                    r.event = target
                    r.save(update_fields=['event'])
            Record.objects.filter(event=ev).update(event=target)
            Medal.objects.filter(event=ev).update(event=target)
            if not target.is_relay:
                target.is_relay = True
                target.save(update_fields=['is_relay'])
            ev.delete()
            merged += 1

        if renamed or merged:
            self.stdout.write(self.style.SUCCESS(
                f'{renamed} relay event(s) renamed, {merged} merged'))
        else:
            self.stdout.write('Relay event names already canonical')
