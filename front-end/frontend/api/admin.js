/**
 * Clinova Healthcare — Admin API
 * Management of staff, users, departments, catalogs, and settings.
 */

import { db, DbError } from '../data/db.js';

export const admin = {
  // --- Staff & Schedule ---
  listStaff() {
    return db.getAll('staff').sort((a,b) => a.name.localeCompare(b.name));
  },
  
  saveStaff(data) {
    return db.transaction(tx => {
      let staff;
      if (data.id) {
        staff = tx.getById('staff', data.id);
        const updated = { ...staff, ...data, updatedAt: new Date().toISOString(), _v: staff._v };
        tx.update('staff', data.id, updated);
        staff = updated;
      } else {
        staff = {
          id: db.generateId('stf'),
          ...data,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _v: 1
        };
        tx.insert('staff', staff);

        // Auto-create a user account for new staff
        tx.insert('users', {
          id: db.generateId('usr'),
          username: data.email.split('@')[0].toLowerCase(),
          passwordHash: 'dummy_hash', // In reality, an invite link sets this
          role: data.role,
          staffId: staff.id,
          isActive: true,
          failedAttempts: 0,
          lockedUntil: null,
          lastLogin: null,
          createdAt: new Date().toISOString(),
          _v: 1
        });
      }
      return staff;
    });
  },

  deactivateStaff(staffId) {
    return db.transaction(tx => {
      const staff = tx.getById('staff', staffId);
      if (!staff.isActive) return staff;

      if (staff.role === 'DOCTOR') {
        const today = new Date().toISOString().split('T')[0];
        const futureAppts = tx.getAll('appointments').filter(a => a.doctorId === staffId && a.date >= today && (a.status === 'SCHEDULED' || a.status === 'CHECKED_IN'));
        
        if (futureAppts.length > 0) {
          throw new DbError(`Cannot deactivate doctor. They have ${futureAppts.length} future scheduled appointments.`, 'CONFLICT_ERROR');
        }
      }

      tx.update('staff', staffId, { isActive: false, updatedAt: new Date().toISOString(), _v: staff._v });
      
      // Deactivate associated user
      const users = tx.getAll('users').filter(u => u.staffId === staffId);
      for (const u of users) {
        tx.update('users', u.id, { isActive: false, _v: u._v });
      }

      return tx.getById('staff', staffId);
    });
  },

  updateSchedule(staffId, scheduleData) {
    return db.transaction(tx => {
      const staff = tx.getById('staff', staffId);
      tx.update('staff', staffId, { schedule: scheduleData, updatedAt: new Date().toISOString(), _v: staff._v });
      return tx.getById('staff', staffId);
    });
  },

  // --- Users ---
  listUsers() {
    return db.getAll('users');
  },

  resetPassword(userId) {
    return db.transaction(tx => {
      const u = tx.getById('users', userId);
      tx.update('users', userId, { passwordHash: 'reset_hash', failedAttempts: 0, lockedUntil: null, _v: u._v });
    });
  },

  unlockUser(userId) {
    return db.transaction(tx => {
      const u = tx.getById('users', userId);
      tx.update('users', userId, { failedAttempts: 0, lockedUntil: null, isActive: true, _v: u._v });
    });
  },

  // --- Departments ---
  listDepartments() {
    return db.getAll('departments').sort((a,b) => a.name.localeCompare(b.name));
  },

  updateDepartment(id, updates) {
    return db.transaction(tx => {
      const dept = tx.getById('departments', id);
      tx.update('departments', id, { ...updates, updatedAt: new Date().toISOString(), _v: dept._v });
    });
  },

  // --- Lab Catalog ---
  updateLabPrice(id, newPrice) {
    return db.transaction(tx => {
      const test = tx.getById('labCatalog', id);
      tx.update('labCatalog', id, { price: newPrice, updatedAt: new Date().toISOString(), _v: test._v });
    });
  },

  // --- Audit Log ---
  getAuditLog() {
    return db.getAll('auditLog').sort((a,b) => b.timestamp.localeCompare(a.timestamp));
  },

  // --- Settings & Data Management ---
  getSettings() {
    const raw = db.getAll('settings');
    const defaults = {
      hospitalName: 'Clinova Healthcare',
      tagline: 'Care you can trust',
      address: 'MG Road, Ernakulam, Kochi - 682011, Kerala',
      phone: '+91-484-2345678',
      email: 'info@clinova.in',
      defaultConsultFee: 50000,
      lowStockThreshold: 10,
      expiryAlertDays: 90,
      sessionTimeoutMins: 30,
      slotDuration: 30,
      startTime: '09:00',
      endTime: '17:00'
    };
    
    const parsed = {};
    for (const r of raw) {
      try {
        const val = JSON.parse(r.value);
        if (r.key === 'clinic.name') parsed.hospitalName = val;
        if (r.key === 'clinic.tagline') parsed.tagline = val;
        if (r.key === 'clinic.address') parsed.address = val;
        if (r.key === 'clinic.phone') parsed.phone = val;
        if (r.key === 'clinic.email') parsed.email = val;
        if (r.key === 'appointment.defaultConsultFee') parsed.defaultConsultFee = val;
        if (r.key === 'pharmacy.lowStockThreshold') parsed.lowStockThreshold = val;
        if (r.key === 'pharmacy.expiryAlertDays') parsed.expiryAlertDays = val;
        if (r.key === 'security.sessionTimeoutMins') parsed.sessionTimeoutMins = val;
        if (r.key === 'appointment.slotDuration') parsed.slotDuration = val;
        if (r.key === 'appointment.startTime') parsed.startTime = val;
        if (r.key === 'appointment.endTime') parsed.endTime = val;
      } catch (e) { }
    }
    return { ...defaults, ...parsed };
  },

  updateSettings(data) {
    return db.transaction(tx => {
      const raw = tx.getAll('settings');
      const map = {
        hospitalName: 'clinic.name',
        tagline: 'clinic.tagline',
        address: 'clinic.address',
        phone: 'clinic.phone',
        email: 'clinic.email',
        defaultConsultFee: 'appointment.defaultConsultFee',
        lowStockThreshold: 'pharmacy.lowStockThreshold',
        expiryAlertDays: 'pharmacy.expiryAlertDays',
        sessionTimeoutMins: 'security.sessionTimeoutMins',
        slotDuration: 'appointment.slotDuration',
        startTime: 'appointment.startTime',
        endTime: 'appointment.endTime'
      };

      for (const [memKey, dbKey] of Object.entries(map)) {
        if (data[memKey] !== undefined) {
          const val = JSON.stringify(data[memKey]);
          const existing = raw.find(r => r.key === dbKey);
          if (existing) {
            tx.update('settings', existing.id, { value: val });
          } else {
            tx.insert('settings', { key: dbKey, value: val });
          }
        }
      }
    });
  },

  exportDataJSON() {
    return JSON.stringify(localStorage);
  },

  importDataJSON(jsonString) {
    const data = JSON.parse(jsonString);
    localStorage.clear();
    for (const key in data) {
      localStorage.setItem(key, data[key]);
    }
  },

  resetToDemoData() {
    // This expects seed.js to be available, usually called from the page context
    return true; 
  }
};
