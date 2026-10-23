"""
cms_pharmapp/views.py
ViewSets for Pharmacy domain:
- MedicineViewSet
- SupplierViewSet
- PurchaseOrderViewSet
- StockLedgerViewSet
"""

import datetime
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import Staff
from .models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry
from .serializers import (
    MedicineSerializer,
    SupplierSerializer,
    PurchaseOrderSerializer,
    StockLedgerEntrySerializer,
)


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
        Restocks a medicine by adding a batch and updating stock.
        Body: { quantity, batchNo, expiryDate, poId?, costPrice? }
        """
        medicine = self.get_object()
        data = request.data
        qty = int(data.get("quantity", 0))
        batch_no = data.get("batchNo", "").strip()
        expiry_date = data.get("expiryDate")

        if qty <= 0 or not batch_no:
            return Response(
                {"detail": "quantity (> 0) and batchNo are required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update batches
        batches = list(medicine.batches) if isinstance(medicine.batches, list) else []
        existing_batch = next((b for b in batches if b.get("batchNo") == batch_no), None)
        if existing_batch:
            existing_batch["quantity"] = int(existing_batch.get("quantity", 0)) + qty
            if expiry_date:
                existing_batch["expiryDate"] = expiry_date
        else:
            batches.append({
                "batchNo": batch_no,
                "quantity": qty,
                "expiryDate": expiry_date,
            })

        medicine.batches = batches
        medicine.stock_quantity += qty
        medicine.save(update_fields=["batches", "stock_quantity", "updated_at"])

        # Write StockLedgerEntry
        staff = getattr(request.user, "staff", None)
        StockLedgerEntry.objects.create(
            medicine=medicine,
            batch_no=batch_no,
            entry_type="RESTOCK",
            quantity=qty,
            reference_id=data.get("poId"),
            note=f"Restocked {qty} units into batch {batch_no}",
            performed_by=staff,
        )

        return Response(self.get_serializer(medicine).data, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=["post"], url_path="receive")
    @transaction.atomic
    def receive(self, request, pk=None):
        """
        Receives PO items, increments medicine stocks and records StockLedgerEntry.
        Body: { items: [{ medicineId, quantity, batchNo, expiryDate }] }
        """
        po = self.get_object()
        if po.status == "RECEIVED":
            return Response({"detail": "This purchase order is already received.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)

        items = request.data.get("items", po.items_data or [])
        staff = getattr(request.user, "staff", None)

        for item in items:
            med_id = item.get("medicineId")
            qty = int(item.get("quantity", 0))
            batch_no = item.get("batchNo") or f"BATCH-{po.order_id}"
            expiry_date = item.get("expiryDate") or (datetime.date.today() + datetime.timedelta(days=365)).isoformat()

            med = Medicine.objects.filter(pk=med_id).first()
            if med and qty > 0:
                batches = list(med.batches) if isinstance(med.batches, list) else []
                batches.append({
                    "batchNo": batch_no,
                    "quantity": qty,
                    "expiryDate": str(expiry_date),
                })
                med.batches = batches
                med.stock_quantity += qty
                med.save(update_fields=["batches", "stock_quantity", "updated_at"])

                StockLedgerEntry.objects.create(
                    medicine=med,
                    batch_no=batch_no,
                    entry_type="PURCHASE",
                    quantity=qty,
                    reference_id=po.order_id,
                    note=f"Received via PO {po.order_id}",
                    performed_by=staff,
                )

        po.status = "RECEIVED"
        po.received_date = datetime.date.today()
        po.save(update_fields=["status", "received_date", "updated_at"])

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
