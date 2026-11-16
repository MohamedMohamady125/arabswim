from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        # Every ImageField upload, in every app, goes through one cleaner
        from django.db.models.signals import pre_save
        from core.images import normalize_on_save
        pre_save.connect(normalize_on_save, dispatch_uid='core.images.normalize_on_save')
