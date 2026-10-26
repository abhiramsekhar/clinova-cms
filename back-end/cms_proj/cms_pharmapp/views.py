"""
cms_pharmapp/views.py
ViewSets for Pharmacy domain:
- MedicineViewSet
- SupplierViewSet
- PurchaseOrderViewSet
- StockLedgerViewSet
"""

import datetime
import json
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import Staff, generate_prefixed_id
from cms_backendapp.audit import log_audit
from cms_doctorapp.models import Prescription, PrescriptionItem
from cms_doctorapp.serializers import PrescriptionSerializer
from cms_recepapp.models import Bill, BillItem, Payment
from .models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry
from .serializers import (
    MedicineSerializer,
    SupplierSerializer,
    PurchaseOrderSerializer,
    StockLedgerEntrySerializer,
)

def _valid_batch_expiry(batch):
    expiry = batch.get("expiryDate")
    if not expiry:
        return None
    try:
        return datetime.date.fromisoformat(str(expiry)[:10])
    except (TypeError, ValueError):
        return None


def _batch_quantity(batch):
    try:
        return max(0, int(batch.get("quantity", 0)))
    except (AttributeError, TypeError, ValueError):
        return 0


def _future_expiry_error(expiry, today=None):
    today = today or timezone.localdate()
    if expiry is None:
        return "Expiry date is required."
    try:
        expiry_date = datetime.date.fromisoformat(str(expiry)[:10])
    except (TypeError, ValueError):
        return "Enter a valid expiry date."
    try:
        latest = today.replace(year=today.year + 1)
    except ValueError:
        latest = today.replace(year=today.year + 1, day=28)
    if expiry_date <= today:
        return "Expiry date must be in the future."
    if expiry_date > latest:
        return "Expiry date cannot be more than one year from today."
    return None


def _dispensed_quantity_by_item(prescription, prescription_items):
    """Include legacy dispense entries, which predate item-level ledger metadata."""
    ledger = StockLedgerEntry.objects.filter(
        reference_id=prescription.prescription_id,
        entry_type="DISPENSE",
        medicine_id__in=[item.medicine_id for item in prescription_items],
    ).order_by("created_at", "entry_id")
    dispensed = {item.item_id: 0 for item in prescription_items}
    legacy_by_medicine = {}
    item_by_id = {item.item_id: item for item in prescription_items}

    for entry in ledger:
        quantity = abs(entry.quantity)
        try:
            metadata = json.loads(entry.note or "")
        except (TypeError, ValueError):
            metadata = {}
        item_id = metadata.get("prescriptionItemId") if isinstance(metadata, dict) else None
        if item_id in item_by_id:
            dispensed[item_id] += quantity
        else:
            legacy_by_medicine[entry.medicine_id] = legacy_by_medicine.get(entry.medicine_id, 0) + quantity

    for item in prescription_items:
        legacy_qty = legacy_by_medicine.get(item.medicine_id, 0)
        if legacy_qty:
            applied = min(legacy_qty, max(0, item.quantity - dispensed[item.item_id]))
            dispensed[item.item_id] += applied
            legacy_by_medicine[item.medicine_id] -= applied

    return dispensed


def _dispensing_history(prescription, prescription_items):
    items_by_id = {item.item_id: item for item in prescription_items}
    items_by_medicine = {}
    for item in prescription_items:
        items_by_medicine.setdefault(item.medicine_id, []).append(item)

    history = []
    for entry in StockLedgerEntry.objects.filter(
        reference_id=prescription.prescription_id,
        entry_type="DISPENSE",
        medicine_id__in=items_by_medicine,
    ).select_related("medicine").order_by("created_at", "entry_id"):
        try:
            metadata = json.loads(entry.note or "")
        except (TypeError, ValueError):
            metadata = {}
        item_id = metadata.get("prescriptionItemId") if isinstance(metadata, dict) else None
        item = items_by_id.get(item_id)
        if item is None:
            item = items_by_medicine[entry.medicine_id][0]
        history.append({
            "itemId": item.item_id,
            "medicineId": entry.medicine_id,
            "medicineName": entry.medicine.name,
            "dosage": item.dosage,
            "frequency": item.frequency,
            "instructions": item.instructions,
            "prescribedQuantity": item.quantity,
            "quantity": abs(entry.quantity),
            "durationDays": metadata.get("durationDays") if isinstance(metadata, dict) else None,
            "batchNo": entry.batch_no,
            "dispensedAt": entry.created_at,
        })
    return history


class PharmacyPrescriptionDispenseView(APIView):
    """Pharmacy-owned dispense workflow; Doctor prescription files remain untouched."""
    permission_classes = [IsRole("ADMIN", "PHARMACIST")()]

    def get(self, request, prescription_id):
        prescription = Prescription.objects.filter(pk=prescription_id).first()
        if not prescription:
            return Response({"detail": "Prescription not found."}, status=status.HTTP_404_NOT_FOUND)
        items = list(
            PrescriptionItem.objects.filter(prescription=prescription)
            .select_related("medicine")
            .order_by("item_id")
        )
        dispensed = _dispensed_quantity_by_item(prescription, items)
        today = timezone.localdate()
        preview = []
        for item in items:
            medicine = item.medicine
            batches = medicine.batches if isinstance(medicine.batches, list) else []
            available = 0
            if medicine.is_active:
                for batch in batches:
                    expiry = _valid_batch_expiry(batch)
                    if batch.get("location") == "COUNTER" and expiry and expiry >= today:
                        try:
                            available += max(0, int(batch.get("quantity", 0)))
                        except (TypeError, ValueError):
                            continue
            preview.append({
                "itemId": item.item_id,
                "remainingQuantity": max(0, item.quantity - dispensed[item.item_id]),
                "availableQuantity": available,
                "isActive": medicine.is_active,
            })
        return Response({
            "items": preview,
            "dispensing": {
                "status": prescription.status,
                "dispensedAt": prescription.dispensed_at,
                "items": _dispensing_history(prescription, items),
            },
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, prescription_id):
        prescription = (
            Prescription.objects.select_for_update()
            .select_related("patient")
            .filter(pk=prescription_id)
            .first()
        )
        if not prescription:
            return Response({"detail": "Prescription not found."}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status in [Prescription.Status.DISPENSED, Prescription.Status.CANCELLED]:
            return Response(
                {"detail": f"Cannot dispense a prescription that is {prescription.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = list(
            PrescriptionItem.objects.filter(prescription=prescription)
            .select_related("medicine")
            .order_by("item_id")
        )
        items_by_id = {item.item_id: item for item in items}
        already_dispensed = _dispensed_quantity_by_item(prescription, items)
        requested = request.data.get("items")
        if not isinstance(requested, list) or not requested:
            return Response({"detail": "At least one dispensing item is required."}, status=status.HTTP_400_BAD_REQUEST)

        selections = {}
        errors = {}
        for selection in requested:
            if not isinstance(selection, dict):
                errors["items"] = "Each dispensing item must be an object."
                continue
            item_id = str(selection.get("itemId", ""))
            if item_id not in items_by_id or item_id in selections:
                errors[item_id or "items"] = "Unknown or duplicate prescription item."
                continue
            quantity = selection.get("quantity")
            duration = selection.get("durationDays")
            if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 0:
                errors[item_id] = "Dispense quantity must be a whole number of at least 0."
                continue
            item = items_by_id[item_id]
            remaining = max(0, item.quantity - already_dispensed[item_id])
            if quantity > remaining:
                errors[item_id] = f"Cannot dispense more than the {remaining} units remaining on this prescription."
                continue
            if quantity:
                if isinstance(duration, bool) or not isinstance(duration, int) or duration < 1:
                    errors[item_id] = "Days supply must be a whole number greater than 0."
                    continue
                if not item.medicine.is_active:
                    errors[item_id] = "This medicine is inactive and cannot be dispensed."
                    continue
            selections[item_id] = {"quantity": quantity, "durationDays": duration or 0}

        if errors:
            return Response(
                {"detail": "Review the dispensing quantities and try again.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not any(selection["quantity"] for selection in selections.values()):
            return Response({"detail": "Enter a quantity greater than 0 for at least one item."}, status=status.HTTP_400_BAD_REQUEST)

        payment_info = request.data.get("payment") or {}
        if not isinstance(payment_info, dict):
            return Response({"detail": "Payment details must be an object."}, status=status.HTTP_400_BAD_REQUEST)
        payment_method = payment_info.get("method", Payment.Method.CASH)
        if payment_method == "INSURANCE":
            payment_method = Payment.Method.OTHER
        if payment_info.get("status") == "PAID" and payment_method not in Payment.Method.values:
            return Response({"detail": "Unsupported payment method."}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, "staff", None)
        total_cost = Decimal("0.00")
        dispensed_this_request = {}
        dispensed_lines = []
        medicine_cache = {}
        eligible_batches = {}

        for item in items:
            selection = selections.get(item.item_id)
            quantity = selection["quantity"] if selection else 0
            if not quantity:
                continue

            medicine = medicine_cache.get(item.medicine_id)
            if medicine is None:
                medicine = Medicine.objects.select_for_update().get(pk=item.medicine_id)
                medicine_cache[item.medicine_id] = medicine
            if not medicine.is_active:
                errors[item.item_id] = "This medicine is inactive and cannot be dispensed."
                continue

            today = timezone.localdate()
            batches = list(medicine.batches) if isinstance(medicine.batches, list) else []
            eligible = []
            for batch in batches:
                expiry = _valid_batch_expiry(batch)
                if (
                    batch.get("location") == "COUNTER"
                    and expiry
                    and expiry >= today
                    and _batch_quantity(batch) > 0
                ):
                    eligible.append((expiry, batch))
            eligible.sort(key=lambda entry: (entry[0], str(entry[1].get("batchNo") or "")))
            eligible_batches[item.medicine_id] = eligible
            available = sum(_batch_quantity(batch) for _, batch in eligible)
            requested_for_medicine = sum(
                chosen["quantity"]
                for chosen_id, chosen in selections.items()
                if items_by_id[chosen_id].medicine_id == item.medicine_id
            )
            if available < requested_for_medicine:
                errors[item.item_id] = f"Only {available} non-expired units are available."
        if errors:
            return Response(
                {"detail": "Stock changed while dispensing. Review the affected items and try again.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for item in items:
            selection = selections.get(item.item_id)
            quantity = selection["quantity"] if selection else 0
            if not quantity:
                continue
            medicine = medicine_cache[item.medicine_id]
            remaining = quantity
            allocated = 0
            for _, batch in eligible_batches[item.medicine_id]:
                if not remaining:
                    break
                batch_quantity = _batch_quantity(batch)
                taken = min(batch_quantity, remaining)
                if not taken:
                    continue
                batch["quantity"] = batch_quantity - taken
                remaining -= taken
                allocated += taken
                dispensed_lines.append({
                    "itemId": item.item_id,
                    "medicineId": medicine.medicine_id,
                    "medicineName": medicine.name,
                    "dosage": item.dosage,
                    "frequency": item.frequency,
                    "instructions": item.instructions,
                    "prescribedQuantity": item.quantity,
                    "quantity": taken,
                    "durationDays": selection["durationDays"],
                    "batchNo": batch.get("batchNo"),
                })
                StockLedgerEntry.objects.create(
                    medicine=medicine,
                    batch_no=batch.get("batchNo"),
                    entry_type="DISPENSE",
                    quantity=-taken,
                    reference_id=prescription.prescription_id,
                    note=json.dumps({
                        "prescriptionItemId": item.item_id,
                        "durationDays": selection["durationDays"],
                        "prescriptionId": prescription.prescription_id,
                    }),
                    performed_by=staff,
                )

            medicine.batches = batches
            medicine.stock_quantity = max(0, medicine.stock_quantity - allocated)
            medicine.save(update_fields=["batches", "stock_quantity", "updated_at"])
            dispensed_this_request[item.item_id] = allocated
            total_cost += Decimal(allocated) * medicine.selling_price

        fully_dispensed = all(
            already_dispensed[item.item_id] + dispensed_this_request.get(item.item_id, 0) >= item.quantity
            for item in items
        )
        prescription.status = (
            Prescription.Status.DISPENSED if fully_dispensed else Prescription.Status.PARTIALLY_DISPENSED
        )
        prescription.dispensed_by = staff
        prescription.dispensed_at = timezone.now()
        prescription.save(update_fields=["status", "dispensed_by", "dispensed_at", "updated_at"])

        if total_cost > 0:
            bill = Bill.objects.create(
                bill_id=generate_prefixed_id("BILL", "BILL"),
                patient=prescription.patient,
                bill_date=timezone.localdate(),
                total_amount=total_cost,
                amount_paid=Decimal("0.00"),
                payment_status=Bill.PaymentStatus.UNPAID,
                generated_by=staff,
            )
            BillItem.objects.create(
                bill_item_id=generate_prefixed_id("BILL_ITEM", "BLI"),
                bill=bill,
                item_type=BillItem.ItemType.PHARMACY,
                source_id=prescription.prescription_id,
                description=f"Pharmacy Dispense for Rx {prescription.prescription_id}",
                amount=total_cost,
            )
            if payment_info.get("status") == "PAID":
                Payment.objects.create(
                    bill=bill,
                    amount_paid=total_cost,
                    payment_date=timezone.localdate(),
                    payment_method=payment_method,
                    transaction_ref=payment_info.get("transactionRef"),
                    received_by=staff,
                )

        log_audit(
            action="DISPENSE_PRESCRIPTION",
            entity_type="PRESCRIPTION",
            entity_id=prescription.prescription_id,
            details={"status": prescription.status, "totalCost": int(round(float(total_cost) * 100))},
            request=request,
        )
        response_data = {
            **PrescriptionSerializer(prescription).data,
            "dispensing": {
                "status": prescription.status,
                "dispensedAt": prescription.dispensed_at,
                "items": dispensed_lines,
            },
        }
        return Response(response_data, status=status.HTTP_200_OK)


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class MedicineViewSet(viewsets.ModelViewSet):
    """Inventory management for medicines."""
    serializer_class = MedicineSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve", "stock_alerts"]:
            return [IsRole("ADMIN", "PHARMACIST", "DOCTOR")()]
        return [IsRole("ADMIN", "PHARMACIST")()]

    def get_queryset(self):
        qs = Medicine.objects.all().order_by("name")

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ["true", "1"])

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)

        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(name__icontains=q) |
                Q(generic_name__icontains=q) |
                Q(manufacturer__icontains=q)
            )

        return qs

    @action(detail=True, methods=["post"], url_path="toggle-active")
    def toggle_active(self, request, pk=None):
        """Toggles is_active status of a medicine."""
        medicine = self.get_object()
        medicine.is_active = not medicine.is_active
        medicine.save(update_fields=["is_active", "updated_at"])
        return Response(self.get_serializer(medicine).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="restock")
    @transaction.atomic
    def restock(self, request, pk=None):
        """
        Transfers an existing Storage Unit batch into Pharmacy Counter stock.
        Body: { quantity, batchNo }
        """
        medicine = Medicine.objects.select_for_update().filter(pk=pk).first()
        if medicine is None:
            return Response({"detail": "Medicine not found."}, status=status.HTTP_404_NOT_FOUND)
        if not medicine.is_active:
            return Response({"detail": "Inactive medicines cannot be restocked or dispensed."}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data
        try:
            qty = int(data.get("quantity", 0))
        except (TypeError, ValueError):
            qty = 0
        batch_no = str(data.get("batchNo") or "").strip()
        if qty <= 0 or not batch_no:
            return Response(
                {"detail": "quantity (> 0) and batchNo are required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batches = list(medicine.batches) if isinstance(medicine.batches, list) else []
        expired = [
            batch for batch in batches
            if _batch_quantity(batch) > 0
            and (
                (expiry := _valid_batch_expiry(batch)) is None
                or expiry < timezone.localdate()
            )
        ]
        if expired:
            return Response(
                {"detail": "Remove expired batches before transferring stock to the counter.", "code": "EXPIRED_BATCHES"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        storage_batch = next(
            (
                batch for batch in batches
                if batch.get("batchNo") == batch_no
                and batch.get("location") == "STORAGE"
                and _batch_quantity(batch) > 0
            ),
            None,
        )
        if storage_batch is None:
            return Response(
                {"detail": "Not available in storage. Please place a purchase order.", "code": "STORAGE_EMPTY"},
                status=status.HTTP_409_CONFLICT,
            )
        if _valid_batch_expiry(storage_batch) is None or _valid_batch_expiry(storage_batch) < timezone.localdate():
            return Response({"detail": "This storage batch has an invalid or expired date."}, status=status.HTTP_400_BAD_REQUEST)
        if qty > _batch_quantity(storage_batch):
            return Response({"detail": f"Only {_batch_quantity(storage_batch)} units are available in storage."}, status=status.HTTP_400_BAD_REQUEST)
        counter_remaining = medicine.counter_capacity - medicine.stock_quantity
        if qty > counter_remaining:
            return Response({"detail": f"Only {max(0, counter_remaining)} units of counter capacity remain."}, status=status.HTTP_400_BAD_REQUEST)

        storage_batch["quantity"] = _batch_quantity(storage_batch) - qty
        expiry_date = str(storage_batch.get("expiryDate"))
        counter_batch = next(
            (
                batch for batch in batches
                if batch.get("batchNo") == batch_no
                and batch.get("location") == "COUNTER"
                and batch.get("expiryDate") == expiry_date
            ),
            None,
        )
        if counter_batch:
            counter_batch["quantity"] = _batch_quantity(counter_batch) + qty
        else:
            batches.append({
                "batchNo": batch_no,
                "quantity": qty,
                "expiryDate": expiry_date,
                "location": "COUNTER",
            })
        medicine.batches = batches
        medicine.stock_quantity += qty
        medicine.storage_quantity -= qty
        medicine.save(update_fields=["batches", "stock_quantity", "storage_quantity", "updated_at"])

        staff = getattr(request.user, "staff", None)
        StockLedgerEntry.objects.create(
            medicine=medicine,
            batch_no=batch_no,
            entry_type="RESTOCK",
            quantity=qty,
            note=f"Transferred {qty} units from Storage to Counter; expiry {expiry_date}",
            performed_by=staff,
        )
        StockLedgerEntry.objects.create(
            medicine=medicine,
            batch_no=batch_no,
            entry_type="TRANSFER_OUT",
            quantity=-qty,
            note=f"Transferred {qty} units from Storage to Counter; expiry {expiry_date}",
            performed_by=staff,
        )

        return Response(self.get_serializer(medicine).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="remove-expired")
    @transaction.atomic
    def remove_expired(self, request, pk=None):
        medicine = Medicine.objects.select_for_update().filter(pk=pk).first()
        if medicine is None:
            return Response({"detail": "Medicine not found."}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        batches = list(medicine.batches) if isinstance(medicine.batches, list) else []
        removed = []
        counter_removed = 0
        storage_removed = 0
        staff = getattr(request.user, "staff", None)
        for batch in batches:
            expiry = _valid_batch_expiry(batch)
            quantity = _batch_quantity(batch)
            if not quantity or (expiry is not None and expiry >= today):
                continue
            location = batch.get("location") or "COUNTER"
            if location == "STORAGE":
                storage_removed += quantity
            else:
                counter_removed += quantity
            removed.append({
                "batchNo": batch.get("batchNo"),
                "expiryDate": str(expiry) if expiry else None,
                "quantity": quantity,
                "location": location,
            })
            batch["quantity"] = 0
            StockLedgerEntry.objects.create(
                medicine=medicine,
                batch_no=batch.get("batchNo"),
                entry_type="EXPIRED_REMOVAL",
                quantity=-quantity,
                note=f"Removed {quantity} expired or undated units from {location}; expiry {expiry or 'not recorded'}",
                performed_by=staff,
            )

        if removed:
            medicine.batches = batches
            medicine.stock_quantity = max(0, medicine.stock_quantity - counter_removed)
            medicine.storage_quantity = max(0, medicine.storage_quantity - storage_removed)
            medicine.save(update_fields=["batches", "stock_quantity", "storage_quantity", "updated_at"])

        return Response({
            "medicine": self.get_serializer(medicine).data,
            "removed": removed,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="stock-alerts")
    def stock_alerts(self, request):
        """Categorizes medicines into out-of-stock, low-stock, and expired/expiring alerts."""
        today = datetime.date.today()
        thirty_days = today + datetime.timedelta(days=30)

        all_meds = Medicine.objects.filter(is_active=True)
        out_of_stock = []
        low_stock = []
        expiring = []
        expired = []

        for med in all_meds:
            med_dict = {
                "id": med.medicine_id,
                "name": med.name,
                "stockQuantity": med.stock_quantity,
                "counterStock": med.stock_quantity,
                "storageStock": med.storage_quantity,
                "totalStock": med.stock_quantity + med.storage_quantity,
                "reorderThreshold": med.reorder_threshold,
            }

            if med.stock_quantity <= 0:
                out_of_stock.append(med_dict)
            elif med.stock_quantity <= med.reorder_threshold:
                low_stock.append(med_dict)

            # Check batches for expiry
            if isinstance(med.batches, list):
                for b in med.batches:
                    exp = b.get("expiryDate")
                    if exp:
                        try:
                            exp_d = datetime.date.fromisoformat(exp) if isinstance(exp, str) else exp
                            if exp_d < today:
                                expired.append({**med_dict, "batchNo": b.get("batchNo"), "expiryDate": str(exp_d)})
                            elif exp_d <= thirty_days:
                                expiring.append({**med_dict, "batchNo": b.get("batchNo"), "expiryDate": str(exp_d)})
                        except Exception:
                            pass

        return Response({
            "outOfStock": out_of_stock,
            "lowStock": low_stock,
            "expiring": expiring,
            "expired": expired,
        }, status=status.HTTP_200_OK)


class SupplierViewSet(viewsets.ModelViewSet):
    """Supplier directory and price rates."""
    serializer_class = SupplierSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "PHARMACIST")()]

    def get_queryset(self):
        qs = Supplier.objects.all().order_by("name")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search.strip())
        return qs

    @action(detail=True, methods=["get"], url_path="rates")
    def rates(self, request, pk=None):
        supplier = self.get_object()
        return Response({
            "supplierId": supplier.supplier_id,
            "name": supplier.name,
            "typicalMedicines": supplier.typical_medicines,
        }, status=status.HTTP_200_OK)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """Purchase order workflow."""
    serializer_class = PurchaseOrderSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "PHARMACIST")()]

    def get_queryset(self):
        qs = PurchaseOrder.objects.select_related("supplier", "created_by").all().order_by("-created_at")
        supplier_id = self.request.query_params.get("supplier")
        if supplier_id:
            qs = qs.filter(supplier__supplier_id=supplier_id)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        staff = getattr(self.request.user, "staff", None)
        serializer.save(created_by=staff)

    def update(self, request, *args, **kwargs):
        return Response({"detail": "Purchase orders can only change through valid status transitions."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Purchase orders cannot be deleted; cancel an Ordered purchase order instead."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post"], url_path="deliver")
    @transaction.atomic
    def deliver(self, request, pk=None):
        """
        Records delivered goods without changing stock.
        Body: { items: [{ medicineId, quantity, batchNo, expiryDate }] }
        """
        po = PurchaseOrder.objects.select_for_update().filter(pk=pk).first()
        if po is None:
            return Response({"detail": "Purchase order not found."}, status=status.HTTP_404_NOT_FOUND)
        if po.status != PurchaseOrder.Status.ORDERED:
            return Response({"detail": "Only Ordered purchase orders can be marked Delivered.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)

        submitted_items = request.data.get("items")
        ordered_items = po.items_data if isinstance(po.items_data, list) else []
        if not isinstance(submitted_items, list) or len(submitted_items) != len(ordered_items):
            return Response({"detail": "At least one purchase item is required."}, status=status.HTTP_400_BAD_REQUEST)
        received_by_medicine = {
            str(item.get("medicineId")): item
            for item in submitted_items
            if isinstance(item, dict)
        }
        if len(received_by_medicine) != len(ordered_items):
            return Response({"detail": "Provide exactly one delivery record for each ordered medicine."}, status=status.HTTP_400_BAD_REQUEST)
        errors = {}
        today = timezone.localdate()
        delivered_items = []
        for item in ordered_items:
            if not isinstance(item, dict):
                errors["items"] = "Purchase order contains an invalid medicine line."
                continue
            med_id = str(item.get("medicineId") or "")
            received = received_by_medicine.get(med_id)
            if received is None:
                errors[med_id or "items"] = "A delivery record is required for each ordered medicine."
                continue
            medicine = Medicine.objects.select_for_update().filter(pk=med_id).first()
            if not medicine:
                errors[med_id or "items"] = "Medicine does not exist."
                continue
            if not medicine.is_active:
                errors[med_id] = "Inactive medicines cannot be received."
                continue
            try:
                raw_quantity = received.get("quantity", 0)
                quantity = int(raw_quantity)
                ordered_quantity = int(item.get("quantity", 0))
            except (TypeError, ValueError):
                quantity = 0
                ordered_quantity = 0
            batch_no = str(received.get("batchNo") or "").strip()
            expiry_date = received.get("expiryDate") or item.get("expiryDate")
            expiry_error = _future_expiry_error(expiry_date, today)
            if isinstance(raw_quantity, bool) or raw_quantity != quantity or quantity <= 0:
                errors[med_id] = "Delivered quantity must be greater than 0."
            elif quantity > ordered_quantity:
                errors[med_id] = "Delivered quantity cannot exceed the ordered quantity."
            elif not batch_no:
                errors[med_id] = "Batch number is required."
            elif expiry_error:
                errors[med_id] = expiry_error
            else:
                delivered_items.append({
                    **item,
                    "deliveredQuantity": quantity,
                    "batchNo": batch_no,
                    "deliveredExpiryDate": str(expiry_date)[:10],
                })

        if errors:
            return Response({"detail": "Correct the delivered stock details.", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        po.items_data = delivered_items
        po.status = PurchaseOrder.Status.DELIVERED
        po.received_date = today
        po.save(update_fields=["items_data", "status", "received_date", "updated_at"])
        return Response(self.get_serializer(po).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="stock")
    @transaction.atomic
    def stock(self, request, pk=None):
        """Moves checked Delivered items into Storage and advances to Stocking."""
        po = PurchaseOrder.objects.select_for_update().filter(pk=pk).first()
        if po is None:
            return Response({"detail": "Purchase order not found."}, status=status.HTTP_404_NOT_FOUND)
        if po.status != PurchaseOrder.Status.DELIVERED:
            return Response({"detail": "Only Delivered purchase orders can move into Stocking.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)

        items = po.items_data if isinstance(po.items_data, list) else []
        locked_medicines = {}
        validated_items = []
        errors = {}
        today = timezone.localdate()
        for item in items:
            if not isinstance(item, dict):
                errors["items"] = "Purchase order contains an invalid medicine line."
                continue
            med_id = str(item.get("medicineId") or "")
            medicine = locked_medicines.get(med_id)
            if medicine is None:
                medicine = Medicine.objects.select_for_update().filter(pk=med_id).first()
                if medicine:
                    locked_medicines[med_id] = medicine
            if medicine is None:
                errors[med_id or "items"] = "Medicine does not exist."
                continue
            if not medicine.is_active:
                errors[med_id] = "Inactive medicines cannot be stocked."
                continue
            existing_batches = medicine.batches if isinstance(medicine.batches, list) else []
            has_expired_stock = any(
                _batch_quantity(batch) > 0
                and (
                    (expiry := _valid_batch_expiry(batch)) is None
                    or expiry < today
                )
                for batch in existing_batches
            )
            if has_expired_stock:
                errors[med_id] = "Remove expired or undated batches before stocking new goods."
                continue
            batches = list(medicine.batches) if isinstance(medicine.batches, list) else []
            quantity = int(item.get("deliveredQuantity", 0))
            batch_no = str(item.get("batchNo") or "").strip()
            expiry_date = item.get("deliveredExpiryDate")
            expiry_error = _future_expiry_error(expiry_date, today)
            if quantity <= 0 or not batch_no or expiry_error:
                errors[med_id] = expiry_error or "Delivered quantity and batch number are required."
                continue
            validated_items.append((medicine, quantity, batch_no, str(expiry_date)[:10], batches))

        if errors:
            return Response({"detail": "Correct the delivered stock details before stocking.", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, "staff", None)
        for medicine, quantity, batch_no, expiry_date, batches in validated_items:
            storage_batch = next(
                (
                    batch for batch in batches
                    if batch.get("batchNo") == batch_no
                    and batch.get("expiryDate") == expiry_date
                    and batch.get("location") == "STORAGE"
                ),
                None,
            )
            if storage_batch:
                storage_batch["quantity"] = _batch_quantity(storage_batch) + quantity
            else:
                batches.append({
                    "batchNo": batch_no,
                    "quantity": quantity,
                    "expiryDate": expiry_date,
                    "location": "STORAGE",
                })
            medicine.batches = batches
            medicine.storage_quantity += quantity
            medicine.save(update_fields=["batches", "storage_quantity", "updated_at"])

            StockLedgerEntry.objects.create(
                medicine=medicine,
                batch_no=batch_no,
                entry_type="PURCHASE",
                quantity=quantity,
                reference_id=po.order_id,
                note=f"Received {quantity} units into Storage; expiry {expiry_date}",
                performed_by=staff,
            )

        po.status = PurchaseOrder.Status.STOCKING
        po.save(update_fields=["status", "updated_at"])

        return Response(self.get_serializer(po).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    @transaction.atomic
    def cancel(self, request, pk=None):
        po = PurchaseOrder.objects.select_for_update().filter(pk=pk).first()
        if po is None:
            return Response({"detail": "Purchase order not found."}, status=status.HTTP_404_NOT_FOUND)
        if po.status != PurchaseOrder.Status.ORDERED:
            return Response({"detail": "Only Ordered purchase orders can be cancelled.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)
        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(po).data, status=status.HTTP_200_OK)


class StockLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    """Audit ledger of all stock adjustments and movements."""
    serializer_class = StockLedgerEntrySerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "PHARMACIST")()]

    def get_queryset(self):
        qs = StockLedgerEntry.objects.select_related("medicine", "performed_by").all().order_by("-created_at")
        med = self.request.query_params.get("medicine")
        if med:
            qs = qs.filter(medicine__medicine_id=med)
        return qs
