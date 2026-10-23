/**
 * Clinova Healthcare — Pharmacy API
 * Business logic for inventory, dispensing, and purchasing.
 *
 * Schema field mapping (fixes validation errors):
 *   medicine.form       (not category-as-form)
 *   medicine.strength   (required)
 *   medicine.unitPrice  (paise, not "price")
 *   medicine.batches    [{ batchNo, expiryDate, quantity, receivedDate }]
 *   medicine.maxStock   (optional, new)
 *   purchaseOrder.totalAmount (required, paise)
 *   purchaseOrder.orderDate   (required, ISO date string)
 *
 * Supplier rate list stored per-supplier in suppliers.rates:
 *   { medicineId: string, rate: number (paise) }[]
 *   One entry per supplierId + medicineId. This is the ONLY source of a PO unitCost:
 *   createPurchaseOrder() looks the rate up here and never accepts a caller-supplied price.
 *
 * Stock status (single definition, see stockStatusOf):
 *   valid stock = quantity in non-expired batches
 *   > reorderLevel -> NORMAL | <= reorderLevel and > 0 -> LOW_STOCK | <= 0 -> OUT_OF_STOCK
 */

import { db, DbError } from '../data/db.js';

/* ── helpers ── */
const PAY_METHODS = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'INSURANCE'];
const REF_METHODS = ['UPI', 'CARD', 'NET_BANKING'];
const REF_PATTERN = /^[A-Za-z0-9\-_/]{6,30}$/;
const today = () => new Date().toISOString().split('T')[0];
const nowISO = () => new Date().toISOString();

/**
 * Return only valid (non-expired, quantity > 0) batches for a medicine,
 * sorted by expiry ascending (FEFO).
 */
function validBatches(med) {
  const t = today();
  return (med.batches || [])
    .filter(b => b.quantity > 0 && b.expiryDate >= t)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

/**
 * Compute available stock (valid batches only).
 */
function availableStock(med) {
  return validBatches(med).reduce((s, b) => s + b.quantity, 0);
}

/**
 * Remove all expired batches from a medicine's batch list.
 * Returns { updatedBatches, removedCount, removedUnits } for UI messaging.
 */
function purgeExpiredBatches(batches) {
  const t = today();
  const expired = batches.filter(b => b.expiryDate < t);
  const valid = batches.filter(b => b.expiryDate >= t);
  const removedCount = expired.length;
  const removedUnits = expired.reduce((s, b) => s + (b.quantity || 0), 0);
  return { updatedBatches: valid, removedCount, removedUnits };
}

/** True for a real calendar date written as YYYY-MM-DD. */
function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s;
}

/**
 * Single stock-status definition used by Inventory, Stock Alerts and the Dashboard.
 * Built on availableStock() so expired batches never count as usable stock.
 */
function stockStatusOf(med) {
  const available = availableStock(med);
  const reorderLevel = Number(med.reorderLevel) || 0;
  let status = 'NORMAL';
  if (available <= 0) status = 'OUT_OF_STOCK';
  else if (available <= reorderLevel) status = 'LOW_STOCK';
  return { status, available, reorderLevel, maxStock: med.maxStock || null };
}

/** Reorder level must be a positive whole number; maxStock (optional) must not be below it. */
function validateStockLimits(reorderLevel, maxStock) {
  if (!Number.isInteger(reorderLevel) || reorderLevel <= 0) {
    throw new DbError('Reorder level must be a whole number greater than 0.', 'VALIDATION_ERROR');
  }
  if (maxStock !== null && maxStock !== undefined) {
    if (!Number.isInteger(maxStock) || maxStock <= 0) {
      throw new DbError('Max stock must be a whole number greater than 0.', 'VALIDATION_ERROR');
    }
    if (maxStock < reorderLevel) {
      throw new DbError('Max stock must not be below the reorder level.', 'VALIDATION_ERROR');
    }
  }
}

/** Validate the batch / expiry / quantity of stock being received (restock or PO receipt). */
function validateStockInput({ quantity, batchNo, expiryDate }) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new DbError('Quantity must be a whole number greater than 0.', 'VALIDATION_ERROR');
  }
  if (!batchNo || !String(batchNo).trim()) throw new DbError('Batch number is required.', 'VALIDATION_ERROR');
  if (!expiryDate) throw new DbError('Expiry date is required.', 'VALIDATION_ERROR');
  if (!isValidISODate(expiryDate)) throw new DbError('Enter a valid expiry date.', 'VALIDATION_ERROR');
  if (expiryDate <= today()) throw new DbError('Expiry date must be in the future.', 'VALIDATION_ERROR');
}

/**
 * Validate a supplier's rate list: known medicine, rate > 0 (whole paise),
 * and at most ONE entry per medicine (a later duplicate replaces the earlier one).
 */
function normalizeRates(rates) {
  if (!Array.isArray(rates)) return [];
  const medIds = new Set(db.getAll('medicines').map(m => m.id));
  const byMed = new Map();
  for (const r of rates) {
    if (!r || !r.medicineId || !medIds.has(r.medicineId)) {
      throw new DbError('Every supplier rate must reference a medicine that exists in inventory.', 'VALIDATION_ERROR');
    }
    if (!Number.isInteger(r.rate) || r.rate <= 0) {
      throw new DbError('Supplier rate must be greater than 0 (whole paise).', 'VALIDATION_ERROR');
    }
    byMed.set(r.medicineId, { medicineId: r.medicineId, rate: r.rate });
  }
  return [...byMed.values()];
}

/**
 * Backward compatibility: suppliers that never had rates configured get them derived from
 * their own Purchase Order history (latest unitCost per supplier + medicine). Nothing is guessed,
 * nothing is overwritten (only suppliers with no rates and no ratesMigrated flag are touched),
 * and PO records are never modified. Best-effort: a failure leaves reads working.
 */
function backfillSupplierRates() {
  try {
    const pending = db.getAll('suppliers')
      .filter(s => !s.ratesMigrated && (!Array.isArray(s.rates) || s.rates.length === 0));
    if (!pending.length) return;
    const medIds = new Set(db.getAll('medicines').map(m => m.id));
    const pos = db.getAll('purchaseOrders')
      .filter(p => p.status !== 'CANCELLED')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    db.transaction(tx => {
      for (const s of pending) {
        const latest = new Map();
        for (const po of pos) {
          if (po.supplierId !== s.id) continue;
          for (const it of po.items || []) {
            if (!it.medicineId || latest.has(it.medicineId) || !medIds.has(it.medicineId)) continue;
            if (Number.isInteger(it.unitCost) && it.unitCost > 0) latest.set(it.medicineId, it.unitCost);
          }
        }
        tx.update('suppliers', s.id, {
          rates: [...latest].map(([medicineId, rate]) => ({ medicineId, rate })),
          ratesMigrated: true,
          _v: s._v
        });
      }
    });
  } catch (err) {
    console.warn('Supplier rate backfill skipped:', err);
  }
}

/**
 * Default pack size for a medicine that has none, derived only from its own form / name.
 * Returns '' when nothing sensible can be inferred (such medicines are left blank, never guessed).
 */
function defaultUnitSize(med) {
  const form = String(med.form || '').toLowerCase();
  const name = String(med.name || '');
  if (form === 'tablet') return '1 Strip (10 tabs)';
  if (form === 'capsule') return '1 Strip (10 caps)';
  if (form === 'inhaler') return '1 Inhaler';
  if (form === 'injection') return '1 Vial';
  if (form === 'gel' || form === 'cream' || form === 'ointment') {
    const g = name.match(/\b(10|30)\s?g\b/i);
    return g ? `1 Tube (${g[1]}g)` : '';
  }
  return '';
}

/**
 * Backfill: medicines saved before Unit Size was required (e.g. the seeded stock) get a default
 * pack size so Inventory is complete. Only blank unitSize values are touched; nothing else changes
 * and existing sizes are never overwritten. Best-effort: a failure leaves reads working.
 */
function backfillUnitSizes() {
  try {
    const pending = db.getAll('medicines').filter(m => !m.unitSize && defaultUnitSize(m));
    if (!pending.length) return;
    db.transaction(tx => {
      for (const m of pending) tx.update('medicines', m.id, { unitSize: defaultUnitSize(m), _v: m._v });
    });
  } catch (err) {
    console.warn('Unit size backfill skipped:', err);
  }
}

/**
 * Add a received batch to a medicine inside a transaction: purge expired batches,
 * enforce maxStock, append the batch and write the PURCHASE stock-ledger entry.
 */
function addBatchInTx(tx, { medicineId, batchNo, expiryDate, quantity, supplierId, poId, performedBy, note }) {
  const med = tx.getById('medicines', medicineId);
  const { updatedBatches, removedCount, removedUnits } = purgeExpiredBatches(med.batches || []);
  const currentStock = validBatches({ batches: updatedBatches }).reduce((s, b) => s + b.quantity, 0);
  if (med.maxStock && (currentStock + quantity) > med.maxStock) {
    const canAdd = Math.max(0, med.maxStock - currentStock);
    throw new DbError(
      `Max stock limit for ${med.name} (${med.maxStock}) would be exceeded. Current valid stock: ${currentStock}. You can add at most ${canAdd} units.`,
      'MAX_STOCK_ERROR'
    );
  }
  const newBatch = {
    batchNo: String(batchNo).trim(),
    expiryDate,
    quantity,
    receivedDate: today(),
    supplierId: supplierId || null,
    poId: poId || null
  };
  tx.update('medicines', medicineId, {
    batches: [...updatedBatches, newBatch],
    updatedAt: nowISO(),
    _v: med._v
  });
  tx.insert('stockLedger', {
    id: db.generateId('sl'),
    medicineId,
    batchNo: newBatch.batchNo,
    type: 'PURCHASE',
    quantity,
    referenceId: poId || null,
    note,
    performedBy: performedBy || 'SYSTEM',
    createdAt: nowISO(),
    _v: 1
  });
  return { removedCount, removedUnits };
}

/**
 * Receive stock against a Purchase Order (all-or-nothing). Used by receivePurchaseOrder()
 * and by restockMedicine() when a PO is linked, so PO quantities/status always stay in sync.
 */
function receivePOInternal(id, receivedItems, pharmacistId) {
  if (!Array.isArray(receivedItems)) throw new DbError('Nothing to receive.', 'VALIDATION_ERROR');
  return db.transaction(tx => {
    const po = tx.getById('purchaseOrders', id);
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      throw new DbError('PO cannot be received.', 'INVALID_STATE');
    }

    // Validate every line before touching anything.
    const lines = new Map();
    for (const recv of receivedItems) {
      if (!recv || recv.quantity === undefined || recv.quantity === null || recv.quantity === 0) continue; // not receiving this item
      const poItem = po.items.find(i => i.medicineId === recv.medicineId);
      if (!poItem) throw new DbError('A received medicine is not on this Purchase Order.', 'VALIDATION_ERROR');
      if (lines.has(recv.medicineId)) throw new DbError(`${poItem.name || recv.medicineId} appears more than once in this receipt.`, 'VALIDATION_ERROR');
      const batchNo = recv.batchNumber || recv.batchNo;
      validateStockInput({ quantity: recv.quantity, batchNo, expiryDate: recv.expiryDate });
      const pending = (poItem.quantityOrdered || 0) - (poItem.quantityReceived || 0);
      if (recv.quantity > pending) {
        throw new DbError(`Cannot receive ${recv.quantity} of ${poItem.name || recv.medicineId}; only ${pending} still pending on this PO.`, 'VALIDATION_ERROR');
      }
      lines.set(recv.medicineId, { quantity: recv.quantity, batchNo, expiryDate: recv.expiryDate });
    }
    if (lines.size === 0) throw new DbError('Enter at least one quantity to receive.', 'VALIDATION_ERROR');

    let allReceived = true;
    const updatedItems = [];
    const expiredInfo = { removedCount: 0, removedUnits: 0 };

    for (const poItem of po.items) {
      let newReceivedQty = poItem.quantityReceived || 0;
      const line = lines.get(poItem.medicineId);
      if (line) {
        const r = addBatchInTx(tx, {
          medicineId: poItem.medicineId,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          supplierId: po.supplierId,
          poId: po.id,
          performedBy: pharmacistId,
          note: 'PO Received'
        });
        expiredInfo.removedCount += r.removedCount;
        expiredInfo.removedUnits += r.removedUnits;
        newReceivedQty += line.quantity;
      }
      updatedItems.push({ ...poItem, quantityReceived: newReceivedQty });
      if (newReceivedQty < poItem.quantityOrdered) allReceived = false;
    }

    tx.update('purchaseOrders', id, {
      items: updatedItems,
      status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
      receivedDate: today(),
      updatedAt: nowISO(),
      _v: po._v
    });

    return { po: tx.getById('purchaseOrders', id), expiredInfo };
  });
}

export const pharmacy = {
  /* ─────────────────────────────────────────────
     STOCK HELPERS
  ───────────────────────────────────────────── */
  /**
   * Legacy helper kept for backward compat with dashboard.
   * Returns total of ALL batches (including expired) – same as before.
   * Use availableStock() for dispensing checks.
   */
  getStockLevel(medicine) {
    if (!medicine || !medicine.batches) return 0;
    return medicine.batches.reduce((t, b) => t + b.quantity, 0);
  },

  /** Valid stock only (non-expired, quantity > 0). */
  getAvailableStock(medicine) {
    return availableStock(medicine);
  },

  /**
   * Stock status from valid (non-expired) stock vs reorderLevel.
   * Returns { status: 'NORMAL'|'LOW_STOCK'|'OUT_OF_STOCK', available, reorderLevel, maxStock }.
   */
  getStockStatus(medicine) {
    return stockStatusOf(medicine);
  },

  /* ─────────────────────────────────────────────
     INVENTORY
  ───────────────────────────────────────────── */
  listMedicines() {
    backfillUnitSizes();
    const t = today();
    return db.getAll('medicines')
      .map(m => {
        // Attach computed fields for UI
        const vb = validBatches(m);
        m.stockLevel = vb.reduce((s, b) => s + b.quantity, 0);
        m.hasExpired = (m.batches || []).some(b => b.expiryDate < t && b.quantity > 0);
        // backward-compat: expose unitPrice as price for old renderers
        m.price = m.unitPrice;
        return m;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  addMedicine(data) {
    if (!data.unitSize || !String(data.unitSize).trim()) {
      throw new DbError('Unit size is required.', 'VALIDATION_ERROR');
    }
    validateStockLimits(data.reorderLevel, data.maxStock || null);
    return db.transaction(tx => {
      const newMed = {
        id: db.generateId('med'),
        name: data.name,
        genericName: data.genericName,
        category: data.category,          // drug category (Analgesic, Antibiotic, …)
        form: data.form,                  // dosage form (Tablet, Capsule, Syrup, …)
        strength: data.strength,          // e.g. "500mg"
        manufacturer: data.manufacturer || '',
        unitPrice: data.unitPrice,        // paise (required by schema)
        unitSize: data.unitSize || '',    // display unit (e.g. "1 Strip")
        reorderLevel: data.reorderLevel,
        maxStock: data.maxStock || null,  // optional upper limit
        batches: [],
        isActive: true,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        _v: 1
      };
      tx.insert('medicines', newMed);
      return newMed;
    });
  },

  updateMedicine(id, data) {
    return db.transaction(tx => {
      const med = tx.getById('medicines', id);
      validateStockLimits(
        data.reorderLevel !== undefined ? data.reorderLevel : med.reorderLevel,
        data.maxStock !== undefined ? data.maxStock : med.maxStock
      );
      if (data.unitSize !== undefined && !String(data.unitSize).trim()) {
        throw new DbError('Unit size is required.', 'VALIDATION_ERROR');
      }
      tx.update('medicines', id, {
        name: data.name !== undefined ? data.name : med.name,
        genericName: data.genericName !== undefined ? data.genericName : med.genericName,
        category: data.category !== undefined ? data.category : med.category,
        form: data.form !== undefined ? data.form : med.form,
        strength: data.strength !== undefined ? data.strength : med.strength,
        manufacturer: data.manufacturer !== undefined ? data.manufacturer : med.manufacturer,
        unitPrice: data.unitPrice !== undefined ? data.unitPrice : med.unitPrice,
        unitSize: data.unitSize !== undefined ? data.unitSize : med.unitSize,
        reorderLevel: data.reorderLevel !== undefined ? data.reorderLevel : med.reorderLevel,
        maxStock: data.maxStock !== undefined ? data.maxStock : med.maxStock,
        updatedAt: nowISO(),
        _v: med._v
      });
      return tx.getById('medicines', id);
    });
  },

  updateMedicineStatus(id, isActive) {
    return db.transaction(tx => {
      const med = tx.getById('medicines', id);
      tx.update('medicines', id, { isActive, updatedAt: nowISO(), _v: med._v });
      return tx.getById('medicines', id);
    });
  },

  /**
   * Restock a single EXISTING, active inventory medicine.
   *  - Unknown medicine  -> MEDICINE_NOT_FOUND (no record is ever created here).
   *  - With poId         -> received against that Purchase Order (PO quantities/status stay in sync).
   *  - supplierId w/o PO -> rejected: supplier purchases must go through a Purchase Order.
   *  - Neither           -> manual restock (donation, return, correction).
   * Expired batches are purged first; maxStock, batch no. and expiry date are enforced.
   * Returns { expiredInfo, updatedMed } for UI feedback.
   */
  restockMedicine({ medicineId, quantity, batchNo, expiryDate, supplierId, poId, performedBy }) {
    let existing;
    try { existing = db.getById('medicines', medicineId); }
    catch {
      throw new DbError('Medicine not found in inventory. Please add/configure the medicine before purchasing stock.', 'MEDICINE_NOT_FOUND');
    }
    if (existing.isActive === false) {
      throw new DbError(`${existing.name} is inactive. Activate it in Inventory before restocking.`, 'INVALID_STATE');
    }
    validateStockInput({ quantity, batchNo, expiryDate });

    if (poId) {
      let po;
      try { po = db.getById('purchaseOrders', poId); }
      catch { throw new DbError('Purchase Order not found.', 'VALIDATION_ERROR'); }
      if (supplierId && supplierId !== po.supplierId) {
        throw new DbError('The selected supplier does not match the Purchase Order.', 'VALIDATION_ERROR');
      }
      if (!po.items.some(i => i.medicineId === medicineId)) {
        throw new DbError('This medicine is not on the selected Purchase Order.', 'VALIDATION_ERROR');
      }
      const r = receivePOInternal(poId, [{ medicineId, quantity, batchNo, expiryDate }], performedBy);
      return { expiredInfo: r.expiredInfo, updatedMed: db.getById('medicines', medicineId) };
    }

    if (supplierId) {
      throw new DbError(
        'Stock bought from a supplier must be received against a Purchase Order. Create a PO for this medicine (the supplier rate is applied automatically), then use Receive Stock.',
        'PO_REQUIRED'
      );
    }

    return db.transaction(tx => {
      const r = addBatchInTx(tx, { medicineId, batchNo, expiryDate, quantity, supplierId: null, poId: null, performedBy, note: 'Manual restock' });
      return {
        expiredInfo: { removedCount: r.removedCount, removedUnits: r.removedUnits },
        updatedMed: tx.getById('medicines', medicineId)
      };
    });
  },

  /* ─────────────────────────────────────────────
     PRESCRIPTIONS / DISPENSING
  ───────────────────────────────────────────── */
  listPrescriptions(status) {
    let all = db.getAll('prescriptions');
    if (status) all = all.filter(p => p.status === status);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  rejectPrescription(id, reason, pharmacistId) {
    if (!reason) throw new DbError('Reason required to reject prescription.', 'VALIDATION_ERROR');
    return db.transaction(tx => {
      const rx = tx.getById('prescriptions', id);
      if (rx.status !== 'PENDING') throw new DbError('Can only reject PENDING prescriptions.', 'INVALID_STATE');

      tx.update('prescriptions', id, {
        status: 'CANCELLED',
        notes: (rx.notes ? rx.notes + '\n' : '') + `Rejected by pharmacy: ${reason}`,
        updatedAt: nowISO(),
        _v: rx._v
      });

      const p = tx.getById('patients', rx.patientId);
      tx.insert('notifications', {
        id: db.generateId('notif'),
        type: 'RX_REJECTED',
        title: 'Prescription Rejected',
        message: `Pharmacy rejected Rx for ${p.name}. Reason: ${reason}`,
        targetRole: null,
        targetUserId: rx.doctorId,
        isRead: false,
        link: 'pages/doctor/prescriptions.html',
        createdAt: nowISO(),
        _v: 1
      });

      return tx.getById('prescriptions', id);
    });
  },

  /**
   * Dispense prescription with payment details.
   * payment: { status: 'PAID'|'UNPAID', method, transactionRef, amountReceived (rupees), insurer, claimNo }
   * Deducts stock FEFO (earliest expiry first) from valid (non-expired) batches only.
   *
   * Validation (all checked before anything is saved; any failure rolls back the whole dispense):
   *   - prescription must be PENDING, have items, and belong to an existing patient
   *   - every item: whole-number quantity > 0, active medicine, price set, enough non-expired stock
   *   - PAID: valid method, amount received >= bill total, reference ID for UPI/Card/Net Banking,
   *           insurer + claim number for Insurance
   */
  dispense(id, pharmacistId, payment = {}) {
    if (!pharmacistId) throw new DbError('Pharmacist is required to dispense.', 'VALIDATION_ERROR');
    if (!payment || typeof payment !== 'object') payment = {};
    if (!['PAID', 'UNPAID'].includes(payment.status)) {
      throw new DbError('Payment status must be Paid or Unpaid.', 'VALIDATION_ERROR');
    }
    const payStatus = payment.status;
    const fmt = paise => '₹' + (paise / 100).toFixed(2);

    return db.transaction(tx => {
      const rx = tx.getById('prescriptions', id);
      if (rx.status !== 'PENDING') throw new DbError('Can only dispense PENDING prescriptions.', 'INVALID_STATE');
      if (!Array.isArray(rx.items) || rx.items.length === 0) {
        throw new DbError('This prescription has no medicines to dispense.', 'VALIDATION_ERROR');
      }
      try { tx.getById('patients', rx.patientId); }
      catch { throw new DbError('Patient record for this prescription was not found.', 'VALIDATION_ERROR'); }

      const t = today();
      const billItems = [];
      let totalRxPrice = 0;
      const dispenseDetails = []; // for saving with prescription

      for (const item of rx.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new DbError(
            `Invalid quantity for ${item.name || item.medicineId}. It must be a whole number greater than 0.`,
            'VALIDATION_ERROR'
          );
        }

        const med = tx.getById('medicines', item.medicineId);
        if (med.isActive === false) {
          throw new DbError(`${med.name} is inactive and cannot be dispensed.`, 'VALIDATION_ERROR');
        }
        const unitPrice = med.unitPrice || med.price || 0;
        if (!(unitPrice > 0)) {
          throw new DbError(`Price is not set for ${med.name}. Update it in Inventory before dispensing.`, 'VALIDATION_ERROR');
        }

        const vb = validBatches(med);
        const available = vb.reduce((s, b) => s + b.quantity, 0);
        let qtyNeeded = item.quantity;

        if (available < qtyNeeded) {
          throw new DbError(
            `Insufficient valid stock for ${med.name}. Available (non-expired): ${available}, Needed: ${qtyNeeded}.`,
            'STOCK_ERROR'
          );
        }

        // FEFO deduction: consume valid batches in expiry order (earliest first)
        const allBatches = [...med.batches];
        const fefoOrder = allBatches
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.quantity > 0 && b.expiryDate >= t)
          .sort((x, y) => x.b.expiryDate.localeCompare(y.b.expiryDate));
        const usedBatchNos = [];

        for (const { b, i } of fefoOrder) {
          if (qtyNeeded <= 0) break;
          const take = Math.min(b.quantity, qtyNeeded);
          allBatches[i] = { ...b, quantity: b.quantity - take };
          qtyNeeded -= take;
          usedBatchNos.push(b.batchNo);
        }

        tx.update('medicines', med.id, {
          batches: allBatches,
          updatedAt: nowISO(),
          _v: med._v
        });

        // One DISPENSE ledger entry per item (history/reports count entries, so keep it one per item)
        tx.insert('stockLedger', {
          id: db.generateId('sl'),
          medicineId: med.id,
          batchNo: usedBatchNos.join(', ') || 'UNKNOWN',
          type: 'DISPENSE',
          quantity: -item.quantity,
          referenceId: rx.id,
          note: `Dispensed to patient ${rx.patientId}`,
          performedBy: pharmacistId,
          createdAt: nowISO(),
          _v: 1
        });

        const itemTotal = unitPrice * item.quantity;
        totalRxPrice += itemTotal;
        billItems.push({
          description: `Pharmacy — ${med.name} (×${item.quantity})`,
          amount: itemTotal,
          type: 'pharmacy',
          referenceId: rx.id
        });

        dispenseDetails.push({
          medicineId: med.id,
          name: med.name,
          quantity: item.quantity,
          unitPrice,
          lineTotal: itemTotal
        });
      }

      // ── Payment validation (needs the final bill total) ──
      let method = null, txnRef = null, insurer = null, claimNo = null;
      let amtReceived = 0;

      if (payStatus === 'PAID') {
        method = payment.method;
        if (!PAY_METHODS.includes(method)) {
          throw new DbError('Select a valid payment method.', 'VALIDATION_ERROR');
        }

        const rawAmt = payment.amountReceived;
        const rupees = Number(rawAmt);
        if (rawAmt === undefined || rawAmt === null || String(rawAmt).trim() === '' || !Number.isFinite(rupees) || rupees <= 0) {
          throw new DbError('Enter the amount received (must be greater than 0).', 'VALIDATION_ERROR');
        }
        amtReceived = Math.round(rupees * 100);
        if (Math.abs(rupees * 100 - amtReceived) > 1e-6) {
          throw new DbError('Amount received can have at most 2 decimal places.', 'VALIDATION_ERROR');
        }
        if (amtReceived < totalRxPrice) {
          throw new DbError(
            `Amount received (${fmt(amtReceived)}) is less than the bill total (${fmt(totalRxPrice)}). Collect the full amount or mark the bill as Unpaid.`,
            'VALIDATION_ERROR'
          );
        }

        if (REF_METHODS.includes(method)) {
          txnRef = String(payment.transactionRef || '').trim();
          if (!REF_PATTERN.test(txnRef)) {
            throw new DbError(
              'Enter a valid transaction/reference ID (6–30 characters: letters, digits, - _ /).',
              'VALIDATION_ERROR'
            );
          }
        }

        if (method === 'INSURANCE') {
          insurer = String(payment.insurer || '').trim();
          claimNo = String(payment.claimNo || '').trim();
          if (insurer.length < 2 || insurer.length > 60) {
            throw new DbError('Insurer name is required (2–60 characters).', 'VALIDATION_ERROR');
          }
          if (!REF_PATTERN.test(claimNo)) {
            throw new DbError('Enter a valid claim / policy number (6–30 characters: letters, digits, - _ /).', 'VALIDATION_ERROR');
          }
        }
      }

      const paidAmount = payStatus === 'PAID' ? totalRxPrice : 0;

      // Create bill (totalRxPrice is always > 0 here because every item must have a price)
      const bill = tx.insert('bills', {
        id: db.generateId('bill'),
        patientId: rx.patientId,
        items: billItems,
        totalAmount: totalRxPrice,
        paidAmount,
        status: payStatus,
        createdBy: pharmacistId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        _v: 1
      });
      const billId = bill.id;

      // Create payment record if paid
      if (payStatus === 'PAID') {
        tx.insert('payments', {
          id: db.generateId('pay'),
          billId,
          amount: paidAmount,
          method,
          transactionRef: txnRef,
          receivedBy: pharmacistId,
          createdAt: nowISO(),
          _v: 1
        });
      }

      // Update prescription with payment info
      tx.update('prescriptions', rx.id, {
        status: 'DISPENSED',
        dispensedBy: pharmacistId,
        dispensedAt: nowISO(),
        billId,
        payment: {
          status: payStatus,
          method,
          transactionRef: txnRef,
          insurer,
          claimNo,
          totalAmount: totalRxPrice,
          amountReceived: amtReceived,
          balance: amtReceived - totalRxPrice,
        },
        dispenseItems: dispenseDetails,
        updatedAt: nowISO(),
        _v: rx._v
      });

      return {
        prescription: tx.getById('prescriptions', rx.id),
        billId,
        totalAmount: totalRxPrice,
        balance: amtReceived - totalRxPrice
      };
    });
  },

  /* ─────────────────────────────────────────────
     SUPPLIERS
  ───────────────────────────────────────────── */
  listSuppliers() {
    backfillSupplierRates();
    return db.getAll('suppliers').sort((a, b) => a.name.localeCompare(b.name));
  },

  saveSupplier(data) {
    return db.transaction(tx => {
      if (data.id) {
        const s = tx.getById('suppliers', data.id);
        const updated = {
          ...s,
          name: data.name,
          contactPerson: data.contactPerson,
          phone: data.phone,
          email: data.email || '',
          address: data.address || s.address || '',
          rates: data.rates ? normalizeRates(data.rates) : (s.rates || []),   // [{ medicineId, rate }] one per medicine
          ratesMigrated: true,
          // Keep typicalMedicines for schema compat but don't expose in UI
          typicalMedicines: s.typicalMedicines || [],
          updatedAt: nowISO(),
          _v: s._v
        };
        tx.update('suppliers', data.id, updated);
        return tx.getById('suppliers', data.id);
      } else {
        const newSupplier = {
          id: db.generateId('sup'),
          name: data.name,
          contactPerson: data.contactPerson,
          phone: data.phone,
          email: data.email || '',
          address: data.address || '',
          rates: normalizeRates(data.rates),
          ratesMigrated: true,
          typicalMedicines: [],
          isActive: true,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          _v: 1
        };
        tx.insert('suppliers', newSupplier);
        return tx.getById('suppliers', newSupplier.id);
      }
    });
  },

  /**
   * Get rates for a given supplier, enriched with medicine details.
   * isActive is false for inactive/unknown medicines (they cannot be put on a new PO).
   */
  getSupplierRates(supplierId) {
    backfillSupplierRates();
    const sup = db.getById('suppliers', supplierId);
    const rates = sup.rates || [];
    return rates.map(r => {
      try {
        const med = db.getById('medicines', r.medicineId);
        return { ...r, medicineName: med.name, isActive: med.isActive !== false };
      } catch {
        return { ...r, medicineName: '(Unknown)', isActive: false };
      }
    });
  },

  /** The configured purchase rate (paise) for supplier + medicine, or null if none. */
  getSupplierRate(supplierId, medicineId) {
    backfillSupplierRates();
    try {
      const sup = db.getById('suppliers', supplierId);
      const r = (sup.rates || []).find(x => x.medicineId === medicineId);
      return r && Number.isInteger(r.rate) && r.rate > 0 ? r.rate : null;
    } catch {
      return null;
    }
  },

  /* ─────────────────────────────────────────────
     PURCHASE ORDERS
  ───────────────────────────────────────────── */
  listPurchases() {
    return db.getAll('purchaseOrders').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Create a Purchase Order. The unit cost of every line is the selected supplier's configured
   * rate for that medicine; a caller-supplied price is never used (a differing unitCost is rejected).
   * items: [{ medicineId, quantityOrdered }]
   */
  createPurchaseOrder(data, pharmacistId) {
    if (!data || !data.supplierId) throw new DbError('Supplier is required.', 'VALIDATION_ERROR');
    if (!Array.isArray(data.items) || data.items.length === 0) throw new DbError('At least one medicine is required.', 'VALIDATION_ERROR');
    if (!pharmacistId) throw new DbError('Pharmacist is required to create a Purchase Order.', 'VALIDATION_ERROR');
    const orderDate = data.orderDate || today();
    if (!isValidISODate(orderDate)) throw new DbError('Enter a valid order date.', 'VALIDATION_ERROR');

    backfillSupplierRates();

    return db.transaction(tx => {
      let sup;
      try { sup = tx.getById('suppliers', data.supplierId); }
      catch { throw new DbError('Selected supplier was not found.', 'VALIDATION_ERROR'); }

      const rateMap = new Map(
        (sup.rates || []).filter(r => Number.isInteger(r.rate) && r.rate > 0).map(r => [r.medicineId, r.rate])
      );
      if (rateMap.size === 0) {
        throw new DbError('No supplier rates configured. Please configure medicine rates for this supplier before creating a Purchase Order.', 'RATE_NOT_CONFIGURED');
      }

      // Validate lines and merge duplicates of the same medicine.
      const qtyByMed = new Map();
      for (const it of data.items) {
        if (!it || !it.medicineId) throw new DbError('Medicine is required for every item.', 'VALIDATION_ERROR');
        if (!Number.isInteger(it.quantityOrdered) || it.quantityOrdered <= 0) {
          throw new DbError('Quantity must be a whole number greater than 0.', 'VALIDATION_ERROR');
        }
        qtyByMed.set(it.medicineId, (qtyByMed.get(it.medicineId) || 0) + it.quantityOrdered);
      }

      const items = [];
      let totalAmount = 0;
      for (const [medicineId, quantityOrdered] of qtyByMed) {
        let med;
        try { med = tx.getById('medicines', medicineId); }
        catch { throw new DbError('Medicine not found in inventory. Please add/configure the medicine before purchasing stock.', 'MEDICINE_NOT_FOUND'); }
        if (med.isActive === false) throw new DbError(`${med.name} is inactive and cannot be ordered.`, 'VALIDATION_ERROR');

        const unitCost = rateMap.get(medicineId);
        if (!unitCost) {
          throw new DbError(`${med.name}: No purchase rate configured for this medicine from this supplier. Configure the supplier rate first.`, 'RATE_NOT_CONFIGURED');
        }
        const tampered = data.items.find(i => i.medicineId === medicineId && i.unitCost !== undefined && i.unitCost !== null && i.unitCost !== unitCost);
        if (tampered) {
          throw new DbError(`${med.name}: the purchase rate comes from the supplier's configured rate and cannot be changed here.`, 'VALIDATION_ERROR');
        }

        items.push({ medicineId, name: med.name, quantityOrdered, quantityReceived: 0, unitCost }); // paise
        totalAmount += unitCost * quantityOrdered;
      }

      return tx.insert('purchaseOrders', {
        id: db.generateId('po'),
        supplierId: data.supplierId,
        items,
        status: 'ORDERED',
        totalAmount,          // required by schema
        orderDate,            // required by schema
        expectedDate: data.expectedDate || null,
        receivedDate: null,
        notes: data.notes || null,
        createdBy: pharmacistId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        _v: 1
      });
    });
  },

  /**
   * Receive stock against a PO. Each received line needs a whole quantity (not above what is
   * still pending), a batch number and a future expiry date. Returns the updated PO.
   */
  receivePurchaseOrder(id, receivedItems, pharmacistId) {
    return receivePOInternal(id, receivedItems, pharmacistId).po;
  },

  /* ─────────────────────────────────────────────
     STOCK ALERTS
  ───────────────────────────────────────────── */
  getStockAlerts() {
    const meds = db.getAll('medicines').filter(m => m.isActive);
    const t = today();
    const ninetyDays = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const alerts = [];

    meds.forEach(m => {
      const vb = validBatches(m);
      const { status, available: stock } = stockStatusOf(m);

      // Valid (non-expired) stock vs reorder level. severity: lower = more urgent (default table order).
      if (status === 'OUT_OF_STOCK') {
        alerts.push({ id: m.id, name: m.name, type: 'OUT_OF_STOCK', severity: 0, stockLevel: stock, reorderLevel: m.reorderLevel, maxStock: m.maxStock || null });
      } else if (status === 'LOW_STOCK') {
        alerts.push({ id: m.id, name: m.name, type: 'LOW_STOCK', severity: 1, stockLevel: stock, reorderLevel: m.reorderLevel, maxStock: m.maxStock || null });
      }

      // Expiring soon (within 90 days, non-expired)
      vb.forEach(b => {
        if (b.expiryDate <= ninetyDays) {
          alerts.push({ id: m.id, name: m.name, type: 'EXPIRY', severity: 3, expiryDate: b.expiryDate, batchQty: b.quantity, batchNo: b.batchNo });
        }
      });

      // Expired batches with qty > 0
      (m.batches || []).filter(b => b.expiryDate < t && b.quantity > 0).forEach(b => {
        alerts.push({ id: m.id, name: m.name, type: 'EXPIRED', severity: 2, expiryDate: b.expiryDate, batchQty: b.quantity, batchNo: b.batchNo });
      });
    });

    return alerts;
  }
};
