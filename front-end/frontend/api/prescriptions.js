/**
 * Clinova Healthcare — Prescriptions API
 * Business logic for prescribing medicines, including allergy checks.
 */

import { db, DbError } from '../data/db.js';

export const prescriptions = {
  /**
   * List prescriptions by doctor or patient.
   */
  list(filters = {}) {
    let all = db.getAll('prescriptions');
    if (filters.doctorId) all = all.filter(p => p.doctorId === filters.doctorId);
    if (filters.patientId) all = all.filter(p => p.patientId === filters.patientId);
    if (filters.status) all = all.filter(p => p.status === filters.status);
    
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Get prescription by ID.
   */
  getById(id) {
    return db.getById('prescriptions', id);
  },

  /**
   * Create a prescription.
   * Enforces allergy checks against the patient's record.
   */
  create(data, explicitOverride = false) {
    return db.transaction(tx => {
      const patient = tx.getById('patients', data.patientId);
      
      // Allergy Check
      if (!explicitOverride && patient.allergies && patient.allergies.length > 0) {
        const allergicItems = [];
        for (const item of data.items) {
          const med = tx.getById('medicines', item.medicineId);
          // Check if medicine name or generic name matches any allergy
          const isAllergic = patient.allergies.some(allergy => {
            const al = allergy.toLowerCase();
            return med.name.toLowerCase().includes(al) || med.genericName.toLowerCase().includes(al);
          });
          if (isAllergic) allergicItems.push(med.name);
        }

        if (allergicItems.length > 0) {
          throw new DbError(
            `Patient is allergic to: ${allergicItems.join(', ')}. Please explicitly override if you intend to prescribe this.`, 
            'ALLERGY_WARNING'
          );
        }
      }

      // Create prescription
      const newRx = {
        id: db.generateId('rx'),
        consultationId: data.consultationId || null,
        patientId: data.patientId,
        doctorId: data.doctorId,
        items: data.items, // {medicineId, name, dosage, frequency, duration, quantity}
        status: 'PENDING',
        dispensedBy: null,
        dispensedAt: null,
        notes: data.notes || (explicitOverride ? 'OVERRIDE: Allergy warning bypassed by doctor.' : null),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _v: 1
      };

      tx.insert('prescriptions', newRx);

      // Create Notification for Pharmacy
      tx.insert('notifications', {
        id: db.generateId('notif'),
        type: 'PRESCRIPTION',
        title: 'New Prescription',
        message: `New prescription added for patient ${patient.name}.`,
        targetRole: 'PHARMACIST',
        targetUserId: null,
        isRead: false,
        link: `pages/pharmacy/prescription-queue.html`,
        createdAt: new Date().toISOString(),
        _v: 1
      });

      return newRx;
    });
  },

  /**
   * Cancel a pending prescription.
   */
  cancel(id) {
    return db.transaction(tx => {
      const rx = tx.getById('prescriptions', id);
      if (rx.status !== 'PENDING') {
        throw new DbError('Only PENDING prescriptions can be cancelled.', 'INVALID_STATE');
      }

      tx.update('prescriptions', id, {
        status: 'CANCELLED',
        updatedAt: new Date().toISOString(),
        _v: rx._v
      });

      return tx.getById('prescriptions', id);
    });
  }
};
