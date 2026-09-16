from django.contrib import admin

from .models import (
    CashBankTransfer,
    DigitalSettlement,
    DigitalSettlementAllocation,
    Expense,
    ExpenseCategory,
    PaymentAccount,
    PaymentAccountMovement,
    SupplierPayment,
    SupplierPaymentAllocation,
    SupplierPaymentAuditLog,
)

admin.site.register(PaymentAccount)
admin.site.register(PaymentAccountMovement)
admin.site.register(SupplierPayment)
admin.site.register(SupplierPaymentAllocation)
admin.site.register(SupplierPaymentAuditLog)
admin.site.register(ExpenseCategory)
admin.site.register(Expense)
admin.site.register(CashBankTransfer)
admin.site.register(DigitalSettlement)
admin.site.register(DigitalSettlementAllocation)
