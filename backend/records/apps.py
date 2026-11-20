from django.apps import AppConfig


class RecordsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'records'

    def ready(self):
        from django.db.models.signals import pre_delete
        from championships.models import Result
        from .signals import drop_records_of_deleted_result
        pre_delete.connect(drop_records_of_deleted_result, sender=Result,
                           dispatch_uid='records.drop_records_of_deleted_result')

