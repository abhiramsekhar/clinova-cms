from django.db import migrations, models


def normalize_purchase_order_statuses(apps, schema_editor):
    PurchaseOrder = apps.get_model("cms_pharmapp", "PurchaseOrder")
    PurchaseOrder.objects.filter(status="DRAFT").update(status="CANCELLED")
    PurchaseOrder.objects.filter(status="RECEIVED").update(status="STOCKING")
    PurchaseOrder.objects.exclude(
        status__in=["ORDERED", "DELIVERED", "STOCKING", "CANCELLED"],
    ).update(status="CANCELLED")


class Migration(migrations.Migration):

    dependencies = [
        ("cms_pharmapp", "0003_counter_storage_inventory"),
    ]

    operations = [
        migrations.AlterField(
            model_name="purchaseorder",
            name="status",
            field=models.CharField(
                choices=[
                    ("ORDERED", "Ordered"),
                    ("DELIVERED", "Delivered"),
                    ("STOCKING", "Stocking"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="ORDERED",
                max_length=25,
            ),
        ),
        migrations.RunPython(normalize_purchase_order_statuses, migrations.RunPython.noop),
    ]
