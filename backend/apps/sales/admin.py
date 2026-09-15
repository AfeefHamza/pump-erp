from django.contrib import admin

from .models import CustomerReceipt, CustomerReceiptAllocation, SalesInvoice, SalesInvoiceLine, SalesInvoiceCreditSlipLink, SalesInvoiceAuditLog

admin.site.register(SalesInvoice)
admin.site.register(SalesInvoiceLine)
admin.site.register(SalesInvoiceCreditSlipLink)
admin.site.register(SalesInvoiceAuditLog)
admin.site.register(CustomerReceipt)
admin.site.register(CustomerReceiptAllocation)
