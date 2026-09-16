from django.contrib import admin

from .models import AccountingPeriodLock, ChartOfAccount, JournalEntry, JournalLine, ShiftAccountingPosting

admin.site.register(ChartOfAccount)
admin.site.register(JournalEntry)
admin.site.register(JournalLine)
admin.site.register(AccountingPeriodLock)
admin.site.register(ShiftAccountingPosting)
