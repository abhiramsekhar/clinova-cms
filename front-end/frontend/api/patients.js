/**
 * Clinova Healthcare — Patients API
 * Business logic for patient management.
 *
 * Receptionist flow:  details -> precheck() -> registerAndPay() -> MRN (patient ID)
 * The MRN is only created together with a PAID registration-fee bill.
 */

import { db, DbError } from '../data/db.js';
import { billing } from './billing.js';

export const DEFAULT_REGISTRATION_FEE = 20000; // paise (₹200) — used if the setting is missing

export const patients = {
  /**
   * List patients with optional search query.
   */
  list(searchQuery = '') {
    const all = db.getAll('patients');
    if (!searchQuery) return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const q = searchQuery.toLowerCase();
    return all.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q))
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Get patient by ID.
   */
  getById(id) {
    return db.getById('patients', id);
  },

  /**
   * Registration fee in paise. Admin can change it with the setting
   * 'billing.registrationFee' (value = paise, e.g. 20000).
   */
  getRegistrationFee() {
    try {
      const s = db.getAll('settings').find(x => x.key === 'billing.registrationFee');
      const n = s ? Number(JSON.parse(s.value)) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REGISTRATION_FEE;
    } catch {
      return DEFAULT_REGISTRATION_FEE;
    }
  },

  /**
   * Check the details without saving anything (guardian rule + duplicates).
   * Call this before asking the patient to pay, so they never pay for a
   * registration that will be rejected.
   */
  precheck(data) {
    validateAndCheckDuplicates(db.getAll('patients'), data);
    return true;
  },

  /**
   * Register a patient WITHOUT a fee (kept for backward compatibility).
   * The reception screens use registerAndPay() instead.
   */
  register(data, createdBy) {
    return db.transaction(tx => buildPatient(tx, data));
  },

  /**
   * Register a patient AND collect the registration fee in one step.
   * Either both the patient and the PAID bill are saved, or nothing is.
   * @param payment { method: 'CASH' | 'CARD' | 'UPI' }
   * @param createdBy staff id of the receptionist
   * @returns { patient, bill }
   */
  registerAndPay(data, payment, createdBy) {
    if (!payment || !payment.method) {
      throw new DbError('Please select a payment method.', 'VALIDATION_ERROR');
    }
    return db.transaction(tx => {
      const patient = buildPatient(tx, data);
      const bill = billing.createBill(tx, {
        patientId: patient.id,
        items: [{
          description: 'Registration fee',
          amount: patients.getRegistrationFee(),
          type: 'registration',
          referenceId: patient.id
        }],
        createdBy,
        payment: { method: payment.method, receivedBy: createdBy }
      });
      return { patient, bill };
    });
  },

  /**
   * Helper: Calculate age from DOB string (YYYY-MM-DD)
   */
  calculateAge(dobString) {
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
};

/* ── internal helpers ── */

function validateAndCheckDuplicates(existing, data) {
  if (!data.name || !data.name.trim()) {
    throw new DbError('Patient name is required.', 'VALIDATION_ERROR');
  }
  if (!data.dateOfBirth || isNaN(new Date(data.dateOfBirth))) {
    throw new DbError('A valid date of birth is required.', 'VALIDATION_ERROR');
  }
  if (new Date(data.dateOfBirth) > new Date()) {
    throw new DbError('Date of birth cannot be in the future.', 'VALIDATION_ERROR');
  }

  // Guardian rule for under-18
  const age = patients.calculateAge(data.dateOfBirth);
  if (age < 18 && (!data.guardianName || !data.guardianPhone)) {
    throw new DbError('Patients under 18 require guardian details.', 'VALIDATION_ERROR');
  }

  // Duplicate rule:
  //  - same name + same date of birth            -> duplicate
  //  - same phone AND same name                  -> duplicate
  //  - same phone but different name (a family sharing one number) -> allowed
  const name = data.name.trim().toLowerCase();
  const isDuplicate = existing.some(p => {
    const sameName = p.name.trim().toLowerCase() === name;
    if (sameName && p.dateOfBirth === data.dateOfBirth) return true;
    if (sameName && data.phone && p.phone === data.phone) return true;
    return false;
  });
  if (isDuplicate) {
    throw new DbError('This patient is already registered (same name and date of birth, or same name and phone).', 'DUPLICATE_PATIENT');
  }
}

function buildPatient(tx, data) {
  const existing = tx.getAll('patients');
  validateAndCheckDuplicates(existing, data);

  // MRN: CLN-YYYY-XXXX  (next number after the highest one used this year)
  const year = new Date().getFullYear();
  const re = new RegExp(`^CLN-${year}-(\\d+)$`);
  const maxSeq = existing.reduce((max, p) => {
    const m = re.exec(p.mrn || '');
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const mrn = `CLN-${year}-${String(maxSeq + 1).padStart(4, '0')}`;

  const newPatient = {
    id: db.generateId('pat'),
    mrn,
    name: data.name.trim(),
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    phone: data.phone || null,
    email: data.email || null,
    address: data.address,
    bloodGroup: data.bloodGroup || null,
    allergies: data.allergies || [],
    chronicConditions: data.chronicConditions || [],
    guardianName: data.guardianName || null,
    guardianPhone: data.guardianPhone || null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _v: 1
  };

  tx.insert('patients', newPatient);
  return newPatient;
}
