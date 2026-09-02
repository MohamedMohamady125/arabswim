from django.apps import AppConfig


class ChampionshipsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'championships'

    def ready(self):
        import championships.signals  # noqa: F401
