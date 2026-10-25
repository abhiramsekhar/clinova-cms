from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cms_recepapp", "0003_remove_appointment_uq_appt_active_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="booking_mode",
            field=models.CharField(
                choices=[("WALK_IN", "Walk-in"), ("PRIOR", "Prior booking")],
                default="PRIOR",
                max_length=10,
            ),
        ),
    ]
