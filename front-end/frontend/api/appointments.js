/**
 * Clinova Healthcare — Appointments API
 * Business logic for booking and managing appointments.
 *
 * Rules implemented here
 *  - Token number = slot number of the day (09:00 -> 1, 09:30 -> 2, ...).
 *    So the token always follows the TIME of the slot, not the booking order.
 *  - WALK_IN : system gives the first free slot from "now"; only for today.
 *  - PRIOR   : patient chooses date + slot.
 *  - Consultation fee comes from the doctor (consultationFee) or the
 *    department (defaultFee).
 *  - bookAndPay() saves appointment + PAID bill + payment in ONE transaction,
 *    so a token is only ever issued after the fee is paid.
 *  - Check-in is refused while the consultation bill is unpaid.
 *  - A NO_SHOW frees the slot so a walk-in can take it.
 */

import { db, DbError } from '../data/db.js';
import { billing } from './billing.js';

export const DEFAULT_CONSULTATION_FEE = 50000; // paise (₹500) — last-resort fallback
export const NO_SHOW_GRACE_MIN = 15;           // minutes after slot time before "No-show" is allowed
const INACTIVE = ['CANCELLED', 'NO_SHOW'];     // these do not occupy a slot

/* ── time helpers (all LOCAL time, not UTC) ── */
const pad = n => String(n).padStart(2, '0');
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const minutesNow = d => d.getHours() * 60 + d.getMinutes();

function setting(key, fallback) {
  try {
    const s = db.getAll('settings').find(x => x.key === key);
    return s ? JSON.parse(s.value) : fallback;
  } catch { return fallback; }
}

/* ── slots ── */
export function getSlotConfig() {
  let step = Number(setting('appointment.slotDuration', 30));
  if (!(step > 0)) step = 30;
  let start = toMin(setting('appointment.startTime', '09:00'));
  let end = toMin(setting('appointment.endTime', '17:00'));
  if (Number.isNaN(start)) start = 540;
  if (Number.isNaN(end)) end = 1020;
  return { start, end, step };
}

/** All slots of a day: [{ time:'09:00', index:0, token:1 }, ...] */
export function getSlots() {
  const { start, end, step } = getSlotConfig();
  const out = [];
  for (let m = start, i = 0; m + step <= end; m += step, i++) {
    out.push({ time: toTime(m), index: i, token: i + 1 });
  }
  return out;
}

/** Pure helper: state of every slot for one doctor on one date. */
function slotBoard(all, doctorId, date, now) {
  const { step } = getSlotConfig();
  const today = todayStr(now);
  const nowM = minutesNow(now);
  const dayAppts = all.filter(a => a.doctorId === doctorId && a.date === date);

  return getSlots().map(s => {
    const active = dayAppts.find(a => a.time === s.time && !INACTIVE.includes(a.status));
    const freed = !active && dayAppts.some(a => a.time === s.time && a.status === 'NO_SHOW');
    const startM = toMin(s.time);
    const endM = startM + step;
    let state = 'free';
    if (active) state = 'booked';
    else if (date < today || (date === today && startM <= nowM)) state = 'past';
    return { ...s, state, freed, endM, patientId: active ? active.patientId : null };
  });
}

/** Pure helper: first slot a walk-in can take right now. */
function pickWalkIn(all, doctorId, now) {
  const nowM = minutesNow(now);
  const board = slotBoard(all, doctorId, todayStr(now), now);
  // free slot that has not ended yet, OR a slot freed by a no-show
  const slot = board.find(s => s.state !== 'booked' && (s.endM > nowM || s.freed));
  if (!slot) {
    throw new DbError('No free slot is left today for this doctor. Choose another doctor or book a later date.', 'NO_SLOT_AVAILABLE');
  }
  // Walk-in token = next number in THIS doctor's queue today (not the clock-slot number)
  return { ...slot, token: nextQueueToken(all, doctorId, todayStr(now)) };
}

/** Next token in a doctor's queue for a date: highest token in use + 1. */
function nextQueueToken(all, doctorId, date) {
  const used = all
    .filter(a => a.doctorId === doctorId && a.date === date && !INACTIVE.includes(a.status) && a.tokenNumber)
    .map(a => a.tokenNumber);
  return Math.max(0, ...used) + 1;
}

/** Consultation fee (paise) for a doctor. */
function feeForDoctor(getById, doctorId) {
  const doctor = getById('staff', doctorId);
  if (typeof doctor.consultationFee === 'number') return doctor.consultationFee;
  if (doctor.departmentId) {
    try {
      const dept = getById('departments', doctor.departmentId);
      if (typeof dept.defaultFee === 'number') return dept.defaultFee;
    } catch { /* fall through */ }
  }
  return DEFAULT_CONSULTATION_FEE;
}

/* ── the one place where a booking is created ── */
function createBooking(tx, data, createdBy, payment, now = new Date()) {
  const mode = data.mode === 'WALK_IN' ? 'WALK_IN' : 'PRIOR';
  if (!data.patientId || !data.doctorId) {
    throw new DbError('Patient and doctor are required.', 'VALIDATION_ERROR');
  }

  const patient = tx.getById('patients', data.patientId);
  if (patient.isActive === false) throw new DbError('This patient record is inactive.', 'VALIDATION_ERROR');
  const doctor = tx.getById('staff', data.doctorId);
  if (doctor.role !== 'DOCTOR' || !doctor.isActive) {
    throw new DbError('The selected doctor is not available.', 'VALIDATION_ERROR');
  }

  const all = tx.getAll('appointments');
  let date, time;

  if (mode === 'WALK_IN') {
    date = todayStr(now);
    const slot = pickWalkIn(all, data.doctorId, now);
    if (data.time && data.time !== slot.time) {
      throw new DbError('The next free slot has changed. Please review the new time and confirm again.', 'SLOT_CHANGED');
    }
    time = slot.time;
  } else {
    date = data.date;
    time = data.time;
    if (!date || !time) throw new DbError('Date and time slot are required.', 'VALIDATION_ERROR');
    if (date < todayStr(now)) throw new DbError('Cannot book a date in the past.', 'VALIDATION_ERROR');
    const slot = slotBoard(all, data.doctorId, date, now).find(s => s.time === time);
    if (!slot) throw new DbError('Invalid time slot.', 'INVALID_SLOT');
    if (slot.state === 'booked') throw new DbError('This time slot is already booked for the selected doctor.', 'SLOT_UNAVAILABLE');
    if (slot.state === 'past') throw new DbError('That time has already passed. Choose a later slot.', 'VALIDATION_ERROR');
  }

  // Token = slot number. (If an older record already uses that number, take the next free one.)
  const slotInfo = getSlots().find(s => s.time === time);
  const usedTokens = all
    .filter(a => a.doctorId === data.doctorId && a.date === date && !INACTIVE.includes(a.status) && a.tokenNumber)
    .map(a => a.tokenNumber);
  let tokenNumber = mode === 'WALK_IN' ? nextQueueToken(all, data.doctorId, date) : slotInfo.token;
  if (usedTokens.includes(tokenNumber)) tokenNumber = Math.max(0, ...usedTokens) + 1;

  const fee = feeForDoctor((c, id) => tx.getById(c, id), data.doctorId);
  const type = data.type || 'New Visit';
  const apptId = db.generateId('appt');
  const billId = billing.nextBillId(tx);
  const nowIso = now.toISOString();

  // A walk-in who has paid is already at the clinic -> straight to the queue.
  const status = (mode === 'WALK_IN' && payment) ? 'CHECKED_IN' : 'SCHEDULED';

  const appointment = tx.insert('appointments', {
    id: apptId,
    patientId: data.patientId,
    doctorId: data.doctorId,
    departmentId: doctor.departmentId,
    date,
    time,
    type,
    status,
    reason: data.reason,
    notes: null,
    tokenNumber,
    mode,
    slotIndex: slotInfo.index,
    billId,
    checkedInAt: status === 'CHECKED_IN' ? nowIso : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    _v: 1
  });

  const docUser = tx.findOne('users', u => u.staffId === data.doctorId && u.isActive !== false);
  if (docUser) {
    tx.insert('notifications', {
      id: db.generateId('notif'),
      type: 'APPOINTMENT',
      targetRole: 'DOCTOR',
      targetUserId: docUser.id,
      title: mode === 'WALK_IN' ? 'Walk-in patient' : 'New appointment',
      message: `${patient.name} has been booked for ${date} at ${time}. Token: ${tokenNumber}`,
      link: `pages/doctor/appointments.html?date=${date}`,
      isRead: false,
      createdAt: nowIso,
      _v: 1
    });
  }

  const bill = billing.createBill(tx, {
    id: billId,
    patientId: data.patientId,
    items: [{
      description: `Consultation — ${type} (${doctor.name})`,
      amount: fee,
      type: 'consultation',
      referenceId: apptId
    }],
    createdBy,
    payment: payment ? { method: payment.method, receivedBy: createdBy } : null
  });

  return { appointment, bill };
}

export const appointments = {
  /**
   * List appointments, optionally filtered by date and doctor.
   */
  list(filters = {}) {
    let all = db.getAll('appointments');

    if (filters.date) all = all.filter(a => a.date === filters.date);
    if (filters.doctorId) all = all.filter(a => a.doctorId === filters.doctorId);
    if (filters.patientId) all = all.filter(a => a.patientId === filters.patientId);
    if (filters.status) all = all.filter(a => a.status === filters.status);

    return all.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  },

  /**
   * Get appointment by ID.
   */
  getById(id) {
    return db.getById('appointments', id);
  },

  /* ── read helpers for the booking screen ── */

  /** Fee (paise) the patient will pay for this doctor. */
  getConsultationFee(doctorId) {
    return feeForDoctor((c, id) => db.getById(c, id), doctorId);
  },

  /** Every slot of the day with its state: free / booked / past. */
  getSlotBoard(doctorId, date, now = new Date()) {
    return slotBoard(db.getAll('appointments'), doctorId, date, now);
  },

  /** The slot (with token) a walk-in would get right now. Throws if none left. */
  nextWalkInSlot(doctorId, now = new Date()) {
    return pickWalkIn(db.getAll('appointments'), doctorId, now);
  },

  /** The consultation bill of an appointment (or null for very old records). */
  getBill(appt) {
    if (!appt || !appt.billId) return null;
    return db.getAll('bills').find(b => b.id === appt.billId) || null;
  },

  /* ── booking ── */

  /**
   * Book a new appointment and create an UNPAID consultation bill.
   * (Kept for compatibility. The reception screen uses bookAndPay().)
   * Check-in stays blocked until that bill is paid.
   */
  book(data, createdBy, now = new Date()) {
    return db.transaction(tx => createBooking(tx, data, createdBy, null, now).appointment);
  },

  /**
   * Book AND take the consultation fee in one step. Token is issued only now.
   * data:    { patientId, doctorId, mode: 'WALK_IN' | 'PRIOR', date?, time?, type?, reason? }
   * payment: { method: 'CASH' | 'CARD' | 'UPI' }
   * @returns { appointment, bill }
   */
  bookAndPay(data, payment, createdBy, now = new Date()) {
    if (!payment || !payment.method) {
      throw new DbError('Please select a payment method.', 'VALIDATION_ERROR');
    }
    return db.transaction(tx => createBooking(tx, data, createdBy, payment, now));
  },

  /**
   * Cancel an appointment. Requires a reason.
   * opts.refund (default true): a PAID fee is refunded (recorded as a REFUND payment).
   * With refund:false a paid bill is left as it is (cancellation charge kept).
   */
  cancel(id, reason, cancelledBy, opts = {}) {
    if (!reason) throw new DbError('A cancellation reason is required.', 'VALIDATION_ERROR');
    const refund = opts.refund !== false;

    return db.transaction(tx => {
      const appt = tx.getById('appointments', id);
      if (['COMPLETED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
        throw new DbError(`Cannot cancel an appointment with status ${appt.status}.`, 'INVALID_STATE');
      }

      const updated = tx.update('appointments', id, {
        status: 'CANCELLED',
        notes: (appt.notes ? appt.notes + '\n' : '') + `Cancelled by ${cancelledBy}: ${reason}`,
        _v: appt._v
      });

      // Find the consultation bill: linked one first, else the old way (unpaid bill with this appointment)
      let bill = appt.billId ? tx.findOne('bills', b => b.id === appt.billId) : null;
      if (!bill) {
        bill = tx.findOne('bills', b => b.status === 'UNPAID' && b.patientId === appt.patientId &&
          b.items.some(i => i.referenceId === appt.id));
      }
      if (bill && bill.status !== 'CANCELLED') {
        const hasMoney = bill.paidAmount > 0;
        if (!hasMoney || refund) billing.cancelBill(tx, bill.id, cancelledBy);
      }
      
      const docUser = tx.findOne('users', u => u.staffId === appt.doctorId && u.isActive !== false);
      if (docUser) {
        const patientName = tx.getById('patients', appt.patientId)?.name || 'Patient';
        tx.insert('notifications', {
          id: db.generateId('notif'),
          type: 'APPOINTMENT',
          targetRole: 'DOCTOR',
          targetUserId: docUser.id,
          title: 'Appointment Cancelled',
          message: `Appointment for ${patientName} on ${appt.date} at ${appt.time} has been cancelled.`,
          link: `pages/doctor/appointments.html?date=${appt.date}`,
          isRead: false,
          createdAt: new Date().toISOString(),
          _v: 1
        });
      }

      return updated;
    });
  },

  /**
   * Mark a booked patient as NO_SHOW (frees the slot for a walk-in).
   * Allowed only NO_SHOW_GRACE_MIN minutes after the slot time.
   * The consultation fee is NOT refunded.
   */
  markNoShow(id, markedBy, now = new Date()) {
    return db.transaction(tx => {
      const appt = tx.getById('appointments', id);
      if (appt.status !== 'SCHEDULED') {
        throw new DbError(`Only a SCHEDULED appointment can be marked no-show (this one is ${appt.status}).`, 'INVALID_STATE');
      }
      const today = todayStr(now);
      const tooEarly = appt.date > today ||
        (appt.date === today && minutesNow(now) < toMin(appt.time) + NO_SHOW_GRACE_MIN);
      if (tooEarly) {
        throw new DbError(`Wait until ${NO_SHOW_GRACE_MIN} minutes after the slot time (${appt.time}) before marking no-show.`, 'TOO_EARLY');
      }
      return tx.update('appointments', id, {
        status: 'NO_SHOW',
        notes: (appt.notes ? appt.notes + '\n' : '') + `Marked no-show by ${markedBy}`,
        _v: appt._v
      });
    });
  },

  /**
   * Update status (e.g. CHECKED_IN).
   * CHECKED_IN is refused until the consultation fee is paid.
   */
  updateStatus(id, status, now = new Date()) {
    return db.transaction(tx => {
      const appt = tx.getById('appointments', id);
      const changes = { status, _v: appt._v };

      if (status === 'CHECKED_IN') {
        if (appt.status !== 'SCHEDULED') {
          throw new DbError(`Cannot check in an appointment with status ${appt.status}.`, 'INVALID_STATE');
        }
        if (appt.billId) {
          const bill = tx.findOne('bills', b => b.id === appt.billId);
          if (!bill || bill.status !== 'PAID') {
            throw new DbError('Consultation fee is unpaid. Collect the payment before check-in.', 'PAYMENT_REQUIRED');
          }
          if (appt.date !== todayStr(now)) {
            throw new DbError('Check-in is only possible on the appointment date.', 'INVALID_STATE');
          }
        }
        changes.checkedInAt = now.toISOString();
      }

      return tx.update('appointments', id, changes);
    });
  }
};