/**
 * Clinova Healthcare — Consultations API
 * Business logic for doctor consultations.
 */

import { db, DbError } from '../data/db.js';
import { appointments } from './appointments.js';

export const consultations = {
  /**
   * Get consultation by ID.
   */
  getById(id) {
    return db.getById('consultations', id);
  },

  /**
   * Get consultations for a specific patient.
   */
  getByPatient(patientId) {
    return db.getAll('consultations')
      .filter(c => c.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Get a draft consultation for an appointment, or create one.
   */
  getOrCreateForAppointment(appointmentId) {
    return db.transaction(tx => {
      const existing = tx.getAll('consultations').find(c => c.appointmentId === appointmentId);
      if (existing) return existing;

      const appt = tx.getById('appointments', appointmentId);
      
      // Update appointment status to IN_PROGRESS if it's not already COMPLETED
      if (appt.status !== 'COMPLETED') {
        tx.update('appointments', appt.id, {
          status: 'IN_PROGRESS',
          updatedAt: new Date().toISOString(),
          _v: appt._v
        });
      }

      const newConsult = {
        id: db.generateId('consult'),
        appointmentId: appt.id,
        patientId: appt.patientId,
        doctorId: appt.doctorId,
        symptoms: appt.reason || '',
        diagnosis: '',
        notes: '',
        vitalSigns: { bp: '', pulse: '', temp: '', spo2: '' },
        isCompleted: false, // Draft state
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _v: 1
      };

      tx.insert('consultations', newConsult);
      return newConsult;
    });
  },

  /**
   * Save a draft consultation.
   */
  saveDraft(id, data) {
    return db.transaction(tx => {
      const c = tx.getById('consultations', id);
      if (c.isCompleted) {
        throw new DbError('Cannot edit a completed consultation directly. Use addendas instead.', 'RECORD_LOCKED');
      }

      tx.update('consultations', id, {
        symptoms: data.symptoms ?? c.symptoms,
        diagnosis: data.diagnosis ?? c.diagnosis,
        notes: data.notes ?? c.notes,
        vitalSigns: data.vitalSigns ?? c.vitalSigns,
        updatedAt: new Date().toISOString(),
        _v: c._v
      });

      return tx.getById('consultations', id);
    });
  },

  /**
   * Complete and lock a consultation.
   */
  complete(id) {
    return db.transaction(tx => {
      const c = tx.getById('consultations', id);
      if (c.isCompleted) return c;

      tx.update('consultations', id, {
        isCompleted: true,
        updatedAt: new Date().toISOString(),
        _v: c._v
      });

      // Mark appointment as completed
      const appt = tx.getById('appointments', c.appointmentId);
      tx.update('appointments', appt.id, {
        status: 'COMPLETED',
        updatedAt: new Date().toISOString(),
        _v: appt._v
      });

      return tx.getById('consultations', id);
    });
  },

  /**
   * Add an addendum to a completed consultation.
   */
  addAddendum(id, text, doctorName) {
    return db.transaction(tx => {
      const c = tx.getById('consultations', id);
      if (!c.isCompleted) {
        throw new DbError('Can only add addendas to completed consultations.', 'INVALID_STATE');
      }

      const addendas = c.addendas || [];
      addendas.push({
        text,
        addedBy: doctorName,
        addedAt: new Date().toISOString()
      });

      tx.update('consultations', id, {
        addendas,
        updatedAt: new Date().toISOString(),
        _v: c._v
      });

      return tx.getById('consultations', id);
    });
  }
};
