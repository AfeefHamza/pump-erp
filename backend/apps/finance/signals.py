from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.organizations.models import Organisation


@receiver(post_save, sender=Organisation)
def create_default_expense_category(sender, instance, created, **kwargs):
    if not created:
        return
    from apps.accounting.services import ensure_standard_chart
    from .models import ExpenseCategory

    ledger = ensure_standard_chart(instance)['general_expenses']
    if not ExpenseCategory.objects.filter(organisation=instance, code__iexact='GENERAL').exists():
        # System seed has no actor yet because the owner membership is created after the organisation.
        ExpenseCategory.objects.bulk_create([ExpenseCategory(
            organisation=instance, code='GENERAL', name='General Expense', ledger_account=ledger,
            description='Default category for routine operating expenses.', display_order=10,
        )])
