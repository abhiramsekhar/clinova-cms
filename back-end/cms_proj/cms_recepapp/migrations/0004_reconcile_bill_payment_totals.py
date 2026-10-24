from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def reconcile_bill_totals(apps, schema_editor):
    Bill = apps.get_model("cms_recepapp", "Bill")
    Payment = apps.get_model("cms_recepapp", "Payment")
    database = schema_editor.connection.alias
    payment_totals = {
        row["bill_id"]: row["total"] or Decimal("0.00")
        for row in Payment.objects.using(database)
        .values("bill_id")
        .annotate(total=Sum("amount_paid"))
    }

    for bill in Bill.objects.using(database).all().iterator():
        if bill.payment_status == "CANCELLED":
            continue
        paid_amount = payment_totals.get(bill.bill_id, Decimal("0.00"))
        if paid_amount >= bill.total_amount:
            payment_status = "PAID"
        elif paid_amount > 0:
            payment_status = "PARTIAL"
        else:
            payment_status = "UNPAID"
        Bill.objects.using(database).filter(pk=bill.pk).update(
            amount_paid=paid_amount,
            payment_status=payment_status,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("cms_recepapp", "0003_remove_appointment_uq_appt_active_slot"),
    ]

    operations = [
        migrations.RunPython(reconcile_bill_totals, migrations.RunPython.noop),
    ]
