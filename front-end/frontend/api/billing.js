/**
 * Clinova Healthcare — Billing API
 * Business logic for invoices and payments.
 */

import { db, DbError } from '../data/db.js';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI'];

export const billing = {
  /**
   * List bills, optionally by patient.
   */
  list(filters = {}) {
    let all = db.getAll('bills');
    if (filters.patientId) all = all.filter(b => b.patientId === filters.patientId);
    if (filters.status) all = all.filter(b => b.status === filters.status);
    
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Get bill by ID.
   */
  getById(id) {
    return db.getById('bills', id);
  },


  /* ─────────────────────────────────────────────────────────────
   * Transaction helpers (used by patients.js and appointments.js).
   * They take a `tx` from db.transaction() so that a bill, its
   * payment and the record it belongs to are saved all-or-nothing.
   * ───────────────────────────────────────────────────────────── */

  /**
   * Next readable invoice number: bill-011, bill-012 ... (continues the existing series).
   */
  nextBillId(tx) {
    const max = tx.getAll('bills').reduce((m, b) => {
      const x = /^bill-(\d+)$/.exec(String(b.id));
      return x ? Math.max(m, Number(x[1])) : m;
    }, 0);
    return 'bill-' + String(max + 1).padStart(3, '0');
  },

  /**
   * Create a bill inside a transaction.
   * If `payment` ({ method, receivedBy }) is given, the bill is created
   * already PAID and a payment record is written. Otherwise it is UNPAID.
   */
  createBill(tx, { id, patientId, items, createdBy, payment }) {
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    const billId = id || billing.nextBillId(tx);

    if (payment && !PAYMENT_METHODS.includes(payment.method)) {
      throw new DbError('Please select a valid payment method.', 'VALIDATION_ERROR');
    }

    const bill = tx.insert('bills', {
      id: billId,
      patientId,
      items,
      totalAmount: total,
      paidAmount: payment ? total : 0,
      status: payment ? 'PAID' : 'UNPAID',
      createdBy
    });

    if (payment && total > 0) {
      tx.insert('payments', {
        id: db.generateId('pay'),
        billId,
        amount: total,
        method: payment.method,
        receivedBy: payment.receivedBy || createdBy
      });
    }
    return bill;
  },

  /**
   * Cancel a bill inside a transaction.
   * - UNPAID bill        -> just cancelled.
   * - PAID/PARTIAL bill  -> cancelled AND a negative 'REFUND' payment is
   *                         recorded so the revenue report stays correct.
   */
  cancelBill(tx, billId, cancelledBy) {
    const bill = tx.getById('bills', billId);
    if (bill.status === 'CANCELLED') return bill;

    if (bill.paidAmount > 0) {
      tx.insert('payments', {
        id: db.generateId('pay'),
        billId: bill.id,
        amount: -bill.paidAmount,
        method: 'REFUND',
        receivedBy: cancelledBy
      });
    }
    return tx.update('bills', bill.id, { status: 'CANCELLED', _v: bill._v });
  },

  /**
   * Payments (including refunds) recorded against a bill.
   */
  paymentsFor(billId) {
    return db.getAll('payments')
      .filter(p => p.billId === billId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * Receive payment for a bill.
   */
  receivePayment(billId, amount, method, receivedBy) {
    return db.transaction(tx => {
      const bill = tx.getById('bills', billId);
      
      if (['PAID', 'CANCELLED'].includes(bill.status)) {
        throw new DbError(`Cannot pay a bill that is ${bill.status}.`, 'INVALID_STATE');
      }

      if (amount <= 0) {
        throw new DbError('Payment amount must be greater than zero.', 'VALIDATION_ERROR');
      }

      const balance = bill.totalAmount - bill.paidAmount;
      if (amount > balance) {
        throw new DbError(`Payment amount exceeds balance due (₹${(balance/100).toFixed(2)}).`, 'VALIDATION_ERROR');
      }

      // Record payment
      const payment = {
        id: db.generateId('pay'),
        billId: bill.id,
        amount: amount,
        method: method,
        receivedBy: receivedBy,
        createdAt: new Date().toISOString(),
        _v: 1
      };
      tx.insert('payments', payment);

      // Update bill
      const newPaidAmount = bill.paidAmount + amount;
      const newStatus = newPaidAmount >= bill.totalAmount ? 'PAID' : 'PARTIAL';
      
      tx.update('bills', bill.id, {
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        _v: bill._v
      });

      return tx.getById('bills', bill.id);
    });
  }
};