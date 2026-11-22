"""Arabswim Awards: one vote per person.

Voters do not sign in (a vote link is opened from Instagram, and a sign-up
step would lose most of them), so "one person" is enforced with what an
anonymous visitor carries:

  1. the device  – the browser keeps a random id; one vote per poll per id
                   (a database constraint, so two quick taps cannot both count);
  2. the network – clearing the browser gives a new id, so votes from one
                   network address are capped per poll. The cap is above 1
                   because a family, a club or a phone operator shares one
                   address between many real people;
  3. the pace    – the vote endpoint accepts a few requests a minute per
                   address.

Only one-way hashes of the id and the address are stored.
"""
import hashlib

from django.conf import settings

VOTES_PER_NETWORK = getattr(settings, 'AWARD_VOTES_PER_NETWORK', 20)


def _hash(kind, value):
    return hashlib.sha256(f'{settings.SECRET_KEY}:{kind}:{value}'.encode()).hexdigest()


def client_address(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() if forwarded else '') or request.META.get('REMOTE_ADDR', '')


def voter_key(device_id):
    device_id = (device_id or '').strip()
    # a real id is a long random string; anything else is not accepted
    if not (16 <= len(device_id) <= 80):
        return None
    return _hash('voter', device_id)


def network_key(request):
    return _hash('network', client_address(request))
