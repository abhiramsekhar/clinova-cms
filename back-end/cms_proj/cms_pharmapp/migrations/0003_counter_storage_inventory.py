import math

from django.db import migrations, models
import django.core.validators


def split_existing_stock(apps, schema_editor):
    Medicine = apps.get_model("cms_pharmapp", "Medicine")
    for medicine in Medicine.objects.all().iterator():
        total = max(0, medicine.stock_quantity or 0)
        capacity = 100
        remaining_counter = min(total, capacity)
        storage_total = 0
        migrated_batches = []

        batches = medicine.batches if isinstance(medicine.batches, list) else []
        for index, batch in enumerate(batches):
            if not isinstance(batch, dict):
                continue
            try:
                quantity = max(0, int(batch.get("quantity", 0)))
            except (TypeError, ValueError):
                quantity = 0
            quantity = min(quantity, total - sum(item["quantity"] for item in migrated_batches))
            if quantity <= 0:
                continue

            expiry = batch.get("expiryDate") or (
                medicine.expiry_date.isoformat() if medicine.expiry_date else None
            )
            counter_quantity = min(quantity, remaining_counter)
            storage_quantity = quantity - counter_quantity
            remaining_counter -= counter_quantity
            storage_total += storage_quantity
            batch_no = batch.get("batchNo") or f"LEGACY-{medicine.medicine_id}-{index + 1}"

            if counter_quantity:
                migrated_batches.append({
                    **batch,
                    "batchNo": batch_no,
                    "quantity": counter_quantity,
                    "expiryDate": expiry,
                    "location": "COUNTER",
                })
            if storage_quantity:
                migrated_batches.append({
                    **batch,
                    "batchNo": batch_no,
                    "quantity": storage_quantity,
                    "expiryDate": expiry,
                    "location": "STORAGE",
                })

        represented = sum(item["quantity"] for item in migrated_batches)
        missing = total - represented
        if missing > 0:
            counter_quantity = min(missing, remaining_counter)
            storage_quantity = missing - counter_quantity
            expiry = medicine.expiry_date.isoformat() if medicine.expiry_date else None
            legacy_batch = {
                "batchNo": f"LEGACY-{medicine.medicine_id}",
                "expiryDate": expiry,
            }
            if counter_quantity:
                migrated_batches.append({
                    **legacy_batch,
                    "quantity": counter_quantity,
                    "location": "COUNTER",
                })
            if storage_quantity:
                migrated_batches.append({
                    **legacy_batch,
                    "quantity": storage_quantity,
                    "location": "STORAGE",
                })
            storage_total += storage_quantity

        medicine.stock_quantity = total - storage_total
        medicine.storage_quantity = storage_total
        medicine.counter_capacity = capacity
        medicine.reorder_threshold = max(1, math.floor(capacity * 0.25))
        medicine.batches = migrated_batches
        medicine.save(update_fields=[
            "stock_quantity",
            "storage_quantity",
            "counter_capacity",
            "reorder_threshold",
            "batches",
        ])


class Migration(migrations.Migration):

    dependencies = [
        ("cms_pharmapp", "0002_supplier_medicine_batches_medicine_form_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="medicine",
            name="storage_quantity",
            field=models.IntegerField(default=0, validators=[django.core.validators.MinValueValidator(0)]),
        ),
        migrations.AddField(
            model_name="medicine",
            name="counter_capacity",
            field=models.IntegerField(default=100, validators=[django.core.validators.MinValueValidator(1)]),
        ),
        migrations.AlterField(
            model_name="medicine",
            name="reorder_threshold",
            field=models.IntegerField(default=25, validators=[django.core.validators.MinValueValidator(1)]),
        ),
        migrations.RunPython(split_existing_stock, migrations.RunPython.noop),
    ]
