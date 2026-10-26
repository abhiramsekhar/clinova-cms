from django.db.models.signals import post_save
from django.dispatch import receiver

from cms_backendapp.models import Notification
from cms_doctorapp.models import Prescription


@receiver(post_save, sender=Prescription, dispatch_uid="cms_pharmapp.new_prescription_notification")
def notify_pharmacy_of_new_prescription(sender, instance, created, **kwargs):
    if not created or instance.status != Prescription.Status.PENDING:
        return

    Notification.objects.create(
        notification_type="PHARMACY_PRESCRIPTION",
        title="New prescription received",
        message=(
            f"Dr. {instance.doctor.staff.name} sent a prescription for "
            f"{instance.patient.name} (Rx {instance.prescription_id})."
        ),
        target_role="PHARMACIST",
        link=f"/pharmacy/prescription-queue?search={instance.prescription_id}",
    )
