import React from 'react';
import ModulePage from '../shared/ModulePage';

export function PharmacyQueuePage() {
  return (
    <ModulePage
      title="Prescription Dispensing Queue"
      subtitle="Pending medication orders awaiting pharmacist verification and batch dispensing"
      icon="icon-clipboard-list"
    />
  );
}

export function PharmacyInventoryPage() {
  return (
    <ModulePage
      title="Medication Inventory"
      subtitle="Stock levels, batch numbers, FEFO tracking, unit pricing, and stock additions"
      icon="icon-package"
      actionLabel="Add Medicine"
    />
  );
}

export function PharmacyPurchasesPage() {
  return (
    <ModulePage
      title="Purchase Orders"
      subtitle="Medication procurement, supplier purchase orders, and receiving goods"
      icon="icon-receipt"
      actionLabel="Create PO"
    />
  );
}

export function PharmacySuppliersPage() {
  return (
    <ModulePage
      title="Medicine Suppliers"
      subtitle="Wholesaler directory, negotiated item prices, and contact information"
      icon="icon-users"
      actionLabel="New Supplier"
    />
  );
}

export function PharmacyAlertsPage() {
  return (
    <ModulePage
      title="Stock Level Alerts"
      subtitle="Out-of-stock items, low stock warnings, and impending medicine expirations"
      icon="icon-alert-triangle"
    />
  );
}

export function PharmacyHistoryPage() {
  return (
    <ModulePage
      title="Dispensing Audit History"
      subtitle="Complete chronological record of all dispensed medications and receipts"
      icon="icon-history"
    />
  );
}
