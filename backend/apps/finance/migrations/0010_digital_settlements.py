import django.db.models.deletion
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0004_seed_settlement_accounts'),
        ('finance', '0009_seed_general_expense_category'),
        ('organizations', '0021_seed_expense_cash_bank_permissions'),
        ('shifts', '0012_fuelcreditslip_is_credit_limit_overridden_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.AlterField(
            model_name='paymentaccountmovement', name='movement_type',
            field=models.CharField(max_length=40, choices=[
                ('supplier_payment', 'Supplier Payment'), ('supplier_payment_reversal', 'Supplier Payment Reversal'),
                ('sales_invoice_receipt', 'Sales Invoice Receipt'), ('sales_invoice_receipt_reversal', 'Sales Invoice Receipt Reversal'),
                ('customer_receipt', 'Customer Receipt'), ('customer_receipt_reversal', 'Customer Receipt Reversal'),
                ('expense', 'Expense'), ('expense_reversal', 'Expense Reversal'),
                ('transfer_out', 'Transfer Out'), ('transfer_in', 'Transfer In'),
                ('transfer_out_reversal', 'Transfer Out Reversal'), ('transfer_in_reversal', 'Transfer In Reversal'),
                ('digital_settlement', 'Digital Settlement'), ('digital_settlement_reversal', 'Digital Settlement Reversal'),
            ]),
        ),
        migrations.CreateModel(
            name='DigitalSettlement', fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('settlement_number', models.CharField(max_length=100)), ('client_request_id', models.UUIDField(blank=True, null=True)),
                ('settlement_date', models.DateField(db_index=True)),
                ('collection_method', models.CharField(choices=[('card', 'Card'), ('upi', 'UPI'), ('fleet_card', 'Fleet Card')], max_length=20)),
                ('provider_name', models.CharField(max_length=100)), ('batch_reference', models.CharField(blank=True, max_length=100, null=True)),
                ('gross_amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('charges_amount', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=15)),
                ('tds_amount', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=15)),
                ('net_amount', models.DecimalField(decimal_places=2, max_digits=15)), ('bank_reference', models.CharField(max_length=100)),
                ('notes', models.TextField(blank=True, null=True)),
                ('status', models.CharField(choices=[('active', 'Active'), ('voided', 'Voided')], db_index=True, default='active', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)), ('voided_at', models.DateTimeField(blank=True, null=True)),
                ('void_reason', models.TextField(blank=True, null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_digital_settlements', to=settings.AUTH_USER_MODEL)),
                ('organisation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='digital_settlements', to='organizations.organisation')),
                ('outlet', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='digital_settlements', to='organizations.outlet')),
                ('payment_account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='digital_settlements', to='finance.paymentaccount')),
                ('voided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='voided_digital_settlements', to=settings.AUTH_USER_MODEL)),
            ], options={'ordering': ['-settlement_date', '-created_at']},
        ),
        migrations.CreateModel(
            name='DigitalSettlementAllocation', fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15)), ('employee_name_snapshot', models.CharField(max_length=255)),
                ('collection_reference_snapshot', models.CharField(blank=True, max_length=100, null=True)),
                ('occurred_at_snapshot', models.DateTimeField()), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('collection', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='digital_settlement_allocations', to='shifts.employeeshiftcollection')),
                ('settlement', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='allocations', to='finance.digitalsettlement')),
            ], options={'ordering': ['occurred_at_snapshot', 'created_at']},
        ),
        migrations.CreateModel(
            name='DigitalSettlementSequence', fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveIntegerField()), ('last_sequence', models.PositiveIntegerField(default=0)),
                ('outlet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='digital_settlement_sequences', to='organizations.outlet')),
            ],
        ),
        migrations.AddConstraint('digitalsettlement', models.UniqueConstraint(fields=('outlet', 'settlement_number'), name='unique_outlet_digital_settlement_number')),
        migrations.AddConstraint('digitalsettlement', models.UniqueConstraint(condition=models.Q(client_request_id__isnull=False), fields=('organisation', 'outlet', 'client_request_id'), name='unique_digital_settlement_client_request')),
        migrations.AddConstraint('digitalsettlement', models.CheckConstraint(condition=models.Q(gross_amount__gt=0), name='digital_settlement_gross_positive')),
        migrations.AddConstraint('digitalsettlement', models.CheckConstraint(condition=models.Q(charges_amount__gte=0), name='digital_settlement_charges_nonnegative')),
        migrations.AddConstraint('digitalsettlement', models.CheckConstraint(condition=models.Q(tds_amount__gte=0), name='digital_settlement_tds_nonnegative')),
        migrations.AddConstraint('digitalsettlement', models.CheckConstraint(condition=models.Q(net_amount__gt=0), name='digital_settlement_net_positive')),
        migrations.AddConstraint('digitalsettlementallocation', models.UniqueConstraint(fields=('settlement', 'collection'), name='unique_settlement_collection_allocation')),
        migrations.AddConstraint('digitalsettlementallocation', models.CheckConstraint(condition=models.Q(amount__gt=0), name='digital_settlement_allocation_positive')),
        migrations.AddConstraint('digitalsettlementsequence', models.UniqueConstraint(fields=('outlet', 'year'), name='unique_outlet_digital_settlement_seq')),
    ]
