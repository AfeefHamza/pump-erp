from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.organizations.models import Organisation


@receiver(post_save, sender=Organisation)
def create_standard_chart_for_new_organisation(sender, instance, created, **kwargs):
    if created:
        from .services import ensure_standard_chart
        ensure_standard_chart(instance)
