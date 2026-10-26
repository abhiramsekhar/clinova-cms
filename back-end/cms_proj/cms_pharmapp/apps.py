from django.apps import AppConfig


class CmsPharmappConfig(AppConfig):
    name = 'cms_pharmapp'

    def ready(self):
        from . import signals
