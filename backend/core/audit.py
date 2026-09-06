"""Lightweight change tracking so admins can undo manual edit mistakes.

Every admin write that goes through the API viewsets records a ChangeLog row
holding the exact field-level diff (old -> new). A later revert restores the
old values. Imports and bulk jobs do NOT go through these viewsets, so only
hand edits are tracked — which is exactly what an admin might want to undo.
"""
from datetime import date, datetime
from decimal import Decimal

# Bookkeeping fields we never track or restore. `manually_edited` is a lock
# flag that must stay True once set (manual edits always win), and the
# timestamps are managed by the ORM.
SKIP_FIELDS = {'created_at', 'updated_at', 'manually_edited'}


def _json_safe(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def snapshot(instance):
    """Concrete editable field values as a JSON-safe dict (FKs stored as *_id)."""
    data = {}
    for f in instance._meta.concrete_fields:
        if f.primary_key or getattr(f, 'auto_now', False) or getattr(f, 'auto_now_add', False):
            continue
        if f.name in SKIP_FIELDS or f.attname in SKIP_FIELDS:
            continue
        try:
            data[f.attname] = _json_safe(getattr(instance, f.attname))
        except Exception:
            pass
    return data


def _diff(old, new):
    changed = {}
    for key in set(old) | set(new):
        ov, nv = old.get(key), new.get(key)
        if ov != nv:
            changed[key] = {'old': ov, 'new': nv}
    return changed


def label_for(instance):
    return f'{instance._meta.app_label}.{instance._meta.model_name}'


def _describe(instance):
    try:
        return str(instance)[:200]
    except Exception:
        return f'{instance._meta.model_name} #{instance.pk}'


def _user_or_none(user):
    return user if getattr(user, 'is_authenticated', False) else None


def log_update(instance, old, new, user):
    """Record an update; no-op if nothing tracked actually changed."""
    from core.models import ChangeLog
    changes = _diff(old, new)
    if not changes:
        return None
    return ChangeLog.objects.create(
        model_label=label_for(instance), object_id=instance.pk,
        object_repr=_describe(instance), action='update',
        changes=changes, user=_user_or_none(user),
    )


def log_create(instance, user):
    from core.models import ChangeLog
    return ChangeLog.objects.create(
        model_label=label_for(instance), object_id=instance.pk,
        object_repr=_describe(instance), action='create',
        changes={k: {'old': None, 'new': v} for k, v in snapshot(instance).items()},
        user=_user_or_none(user),
    )


def log_delete(instance, user):
    from core.models import ChangeLog
    return ChangeLog.objects.create(
        model_label=label_for(instance), object_id=instance.pk,
        object_repr=_describe(instance), action='delete',
        changes={k: {'old': v, 'new': None} for k, v in snapshot(instance).items()},
        user=_user_or_none(user),
    )


class AuditLogMixin:
    """Drop-in for a ModelViewSet that has no custom perform_* hooks.

    Records create/update/delete so the edit can be undone later. Viewsets
    that already override perform_* (Swimmer, Result, Championship) call the
    log_* helpers directly instead.
    """

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_create(serializer.instance, self.request.user)

    def perform_update(self, serializer):
        model = type(serializer.instance)
        old = snapshot(model.objects.get(pk=serializer.instance.pk))
        super().perform_update(serializer)
        log_update(serializer.instance, old, snapshot(serializer.instance), self.request.user)

    def perform_destroy(self, instance):
        log_delete(instance, self.request.user)
        super().perform_destroy(instance)
