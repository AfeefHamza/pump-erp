from django.contrib import admin

from .models import PaymentAccount, PaymentAccountMovement, SupplierPayment, SupplierPaymentAllocation, SupplierPaymentAuditLog

admin.site.register(PaymentAccount)
admin.site.register(PaymentAccountMovement)
admin.site.register(SupplierPayment)
admin.site.register(SupplierPaymentAllocation)
admin.site.register(SupplierPaymentAuditLog)
