"""A record must not outlive the swim it was made from.

Automatic records point at a meet result. When that result is deleted (a meet
removed, or deleted and imported again) the record used to stay behind with
no result: it kept its place in the record book, so the re-imported swim
could not become the record, and a record made from a typing slip
("2.16" for a 200 m) stayed an Arab record with nothing left to correct.

Now the record goes with its result, and the book it sat in is handed back
to the fastest swim still on file. Hand-entered records (MANUAL / IMPORT)
have no result and are never touched.
"""
from django.db import transaction

from .models import Record


def record_book_key(rec):
    """Which record book a record sits in."""
    return (rec.record_type, rec.event_id, rec.pool, rec.swimmer.sex,
            rec.country_id if rec.record_type == 'NATIONAL' else None, rec.event.is_relay)


def restore_books(keys):
    """Give each book back to its fastest eligible swim still on file."""
    from .auto import check_and_update_records
    from .sync import _fastest_eligible
    restored = 0
    for key in keys:
        if key[0] not in ('NATIONAL', 'ARAB', 'GCC'):
            continue
        best = _fastest_eligible(*key)
        if best is not None:
            before = Record.objects.count()
            check_and_update_records(best)
            restored += max(0, Record.objects.count() - before)
    return restored


def drop_records_of_deleted_result(sender, instance, **kwargs):
    recs = list(Record.objects.filter(result=instance, source='AUTO').select_related('event', 'swimmer'))
    if not recs:
        return
    keys = {record_book_key(r) for r in recs}
    Record.objects.filter(pk__in=[r.pk for r in recs]).delete()
    # after the deletion is final, so the deleted swim cannot win its book back
    transaction.on_commit(lambda: restore_books(keys))
