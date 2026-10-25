import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { medicinesApi, prescriptionsApi } from '../../api/resources';
import Badge from '../../components/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { DataTable, Modal, useToast } from '../../components/ui';
import { formatDate } from '../../utils/format';
import ModulePage from '../shared/ModulePage';

export function PharmacyQueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [quantities, setQuantities] = useState({});
  const prescriptionsQuery = useQuery({
    queryKey: ['pharmacyPrescriptions'],
    queryFn: () => prescriptionsApi.list({ status: 'PENDING,PARTIALLY_DISPENSED', page_size: 200 }),
  });
  const medicinesQuery = useQuery({
    queryKey: ['pharmacyMedicineCatalogue'],
    queryFn: () => medicinesApi.list({ page_size: 500 }),
  });
  const prescriptions = Array.isArray(prescriptionsQuery.data) ? prescriptionsQuery.data : prescriptionsQuery.data?.results || [];
  const medicines = Array.isArray(medicinesQuery.data) ? medicinesQuery.data : medicinesQuery.data?.results || [];
  const medicinesById = useMemo(() => new Map(medicines.map((medicine) => [String(medicine.id), medicine])), [medicines]);
  const dispenseMutation = useMutation({
    mutationFn: ({ prescription, items }) => prescriptionsApi.dispense(prescription.id, { items }),
    onSuccess: () => {
      toast.success('Prescription dispensed and inventory updated.');
      setSelectedPrescription(null);
      setQuantities({});
      queryClient.invalidateQueries({ queryKey: ['pharmacyPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyMedicineCatalogue'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyStockAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['doctorPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['doctorMedicineCatalogue'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to dispense this prescription.'),
  });
  const openDispense = (prescription) => {
    setSelectedPrescription(prescription);
    setQuantities(Object.fromEntries((prescription.items || []).map((item) => [item.id, ''])));
  };
  const availableFor = (item) => {
    const medicine = medicinesById.get(String(item.medicineId));
    if (!medicine) return 0;
    const stock = Math.max(0, Number(medicine.stockQuantity) || 0);
    const batches = Array.isArray(medicine.batches) ? medicine.batches : [];
    if (!batches.length) return stock;
    const batchStock = batches.reduce((total, batch) => total + Math.max(0, Number(batch.quantity) || 0), 0);
    return Math.min(stock, batchStock);
  };
  const submitDispense = (event) => {
    event.preventDefault();
    if (!selectedPrescription?.items?.length) return;
    const items = selectedPrescription.items.map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id]) }));
    if (items.some(({ quantity }) => !Number.isInteger(quantity) || quantity < 1)) {
      toast.error('Enter a whole number greater than zero for every medicine.');
      return;
    }
    const exceedsStock = selectedPrescription.items.some((item) => Number(quantities[item.id]) > availableFor(item));
    if (exceedsStock) {
      toast.error('A requested quantity exceeds current available stock. Refresh inventory and adjust the quantities.');
      return;
    }
    dispenseMutation.mutate({ prescription: selectedPrescription, items });
  };
  const columns = [
    { key: 'id', label: 'Prescription', sortable: true },
    { key: 'patientName', label: 'Patient', sortable: true },
    { key: 'doctorName', label: 'Doctor', sortable: true },
    { key: 'dateIssued', label: 'Issued', sortable: true, render: (row) => formatDate(row.dateIssued || row.createdAt) },
    { key: 'items', label: 'Medicines', render: (row) => (row.items || []).map((item) => item.medicineName || item.medicineId).join(', ') || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'actions', label: '', render: (row) => <button type="button" className="btn btn--primary btn--sm" onClick={() => openDispense(row)}>Review and dispense</button> },
  ];

  return (
    <div className="doctor-workspace">
      <div className="page-header">
        <div className="page-header__info"><h1 className="text-page-title">Prescription Dispensing Queue</h1><p className="text-caption">Review each order and enter the quantity dispensed for every medicine.</p></div>
      </div>
      <section className="glass card" style={{ padding: '1rem' }}>
        {prescriptionsQuery.isLoading || medicinesQuery.isLoading ? <LoadingState message="Loading prescriptions and stock..." />
          : prescriptionsQuery.error ? <ErrorState title="Unable to load prescriptions" error={prescriptionsQuery.error} onRetry={prescriptionsQuery.refetch} />
            : medicinesQuery.error ? <ErrorState title="Unable to load inventory" error={medicinesQuery.error} onRetry={medicinesQuery.refetch} />
              : <DataTable columns={columns} data={prescriptions} emptyTitle="No prescriptions awaiting dispensing" emptyMessage="New prescriptions from completed doctor visits will appear here." />}
      </section>
      <Modal isOpen={Boolean(selectedPrescription)} onClose={() => { if (!dispenseMutation.isPending) setSelectedPrescription(null); }} title={`Dispense ${selectedPrescription?.id || 'prescription'}`} size="lg" trapFocus>
        {selectedPrescription && <form onSubmit={submitDispense}>
          <p><strong>Patient:</strong> {selectedPrescription.patientName} &nbsp; <strong>Doctor:</strong> {selectedPrescription.doctorName}</p>
          {(selectedPrescription.items || []).map((item) => {
            const medicine = medicinesById.get(String(item.medicineId));
            const available = availableFor(item);
            return <div key={item.id} className="glass card" style={{ padding: '1rem', marginBottom: '.75rem' }}>
              <strong>{medicine?.name || item.medicineName || item.medicineId}</strong>{medicine?.strength ? ` · ${medicine.strength}` : ''}
              <p className="text-caption" style={{ margin: '.35rem 0' }}>{[item.dosage, item.frequency, item.durationDays ? `${item.durationDays} days` : null, item.instructions].filter(Boolean).join(' · ') || 'No additional directions'}</p>
              <p className="text-caption" style={{ margin: '.35rem 0' }}>Available stock: {available}{Array.isArray(medicine?.batches) && medicine.batches.length ? ` across ${medicine.batches.length} batches` : ''}</p>
              <label className="form-group__label" htmlFor={`dispense-${item.id}`}>Quantity to dispense</label>
              <input id={`dispense-${item.id}`} className="form-control" type="number" min="1" max={available} step="1" required value={quantities[item.id] ?? ''} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} disabled={available < 1} />
              {available < 1 && <p role="alert">No available stock. Replenish inventory before dispensing this medicine.</p>}
            </div>;
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setSelectedPrescription(null)} disabled={dispenseMutation.isPending}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={dispenseMutation.isPending || !(selectedPrescription.items || []).length || selectedPrescription.items.some((item) => availableFor(item) < 1)}>{dispenseMutation.isPending ? 'Dispensing…' : 'Confirm dispense'}</button>
          </div>
        </form>}
      </Modal>
    </div>
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
