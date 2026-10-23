/**
 * Clinova Healthcare — Reports & Dashboard API
 * Consolidates all dashboard queries and report generation.
 */

import { db } from '../data/db.js';

export const reports = {
  // --- Admin Dashboard Stats ---
  getAdminStats() {
    const today = new Date().toISOString().split('T')[0];
    const staff = db.getAll('staff');
    const appts = db.getAll('appointments');
    const labs = db.getAll('labOrders');
    const meds = db.getAll('medicines');
    const depts = db.getAll('departments');

    const activeDocs = staff.filter(s => s.role === 'DOCTOR' && s.isActive).length;
    const todayAppts = appts.filter(a => a.date === today);
    const pendingLabs = labs.filter(l => l.status === 'ORDERED' || l.status === 'SAMPLE_COLLECTED');

    // Chart Data (7 days)
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      chartData.push({
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: appts.filter(a => a.date === dateStr).length
      });
    }

    // Department overview
    const deptOverview = depts.map(d => ({
      id: d.id,
      name: d.name,
      doctors: staff.filter(s => s.departmentId === d.id && s.isActive).length,
      todayAppts: todayAppts.filter(a => {
        const doc = staff.find(s => s.id === a.doctorId);
        return doc && doc.departmentId === d.id;
      }).length
    }));

    // Stock Alerts
    const ninetyDays = new Date(new Date().getTime() + (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const stockAlerts = [];
    meds.forEach(m => {
      if (!m.isActive) return;
      const stock = m.batches ? m.batches.reduce((total, batch) => total + batch.quantity, 0) : 0;
      if (stock <= m.reorderLevel) {
        stockAlerts.push({ name: m.name, issue: `Low Stock (${stock})`, type: 'danger' });
      }
      m.batches?.forEach(b => {
        if (b.quantity > 0 && b.expiryDate <= ninetyDays) {
          stockAlerts.push({ name: m.name, issue: `Expiring Soon (${b.expiryDate})`, type: 'warning' });
        }
      });
    });

    return {
      totalStaff: staff.filter(s => s.isActive).length,
      activeDoctors: activeDocs,
      todayAppointments: todayAppts.length,
      pendingLabTests: pendingLabs.length,
      chartData,
      deptOverview,
      stockAlerts: stockAlerts.slice(0, 10), // Limit alerts
      recentActivity: db.getAll('auditLog').sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5)
    };
  },

  // --- Doctor Dashboard Stats ---
  getDoctorStats(doctorId) {
    const today = new Date().toISOString().split('T')[0];
    const myAppts = db.getAll('appointments').filter(a => a.doctorId === doctorId && a.date === today);
    const myLabs = db.getAll('labOrders').filter(l => l.doctorId === doctorId && l.status !== 'COMPLETED' && l.status !== 'CANCELLED');
    const myRxs = db.getAll('prescriptions').filter(p => p.doctorId === doctorId && p.status === 'PENDING');

    return {
      pendingAppts: myAppts.filter(a => a.status === 'SCHEDULED' || a.status === 'CHECKED_IN').length,
      completedAppts: myAppts.filter(a => a.status === 'COMPLETED').length,
      pendingLabs: myLabs.length,
      activeRxs: myRxs.length,
      todayApptsList: myAppts.sort((a, b) => a.time.localeCompare(b.time)),
      pendingLabsList: myLabs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  },

  // --- Receptionist Dashboard Stats ---
  getReceptionStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayAppts = db.getAll('appointments').filter(a => a.date === today);
    const bills = db.getAll('bills');

    return {
      checkedIn: todayAppts.filter(a => a.status === 'CHECKED_IN').length,
      scheduled: todayAppts.filter(a => a.status === 'SCHEDULED').length,
      completed: todayAppts.filter(a => a.status === 'COMPLETED').length,
      unpaidBills: bills.filter(b => b.status === 'UNPAID' || b.status === 'PARTIAL').length,
      todayApptsList: todayAppts.sort((a, b) => a.time.localeCompare(b.time)),
      recentBillsList: bills.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
    };
  },

  // --- Pharmacist Dashboard Stats ---
  getPharmacyStats() {
    const today = new Date().toISOString().split('T')[0];
    const pendingRx = db.getAll('prescriptions').filter(p => p.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const meds = db.getAll('medicines').filter(m => m.isActive);
    
    let lowStockCount = 0;
    let expiringSoonCount = 0;
    const lowStockList = [];
    const ninetyDays = new Date(new Date().getTime() + (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    meds.forEach(m => {
      m.stockLevel = m.batches ? m.batches.reduce((total, batch) => total + batch.quantity, 0) : 0;
      if (m.stockLevel <= m.reorderLevel) {
        lowStockCount++;
        lowStockList.push(m);
      }
      m.batches?.forEach(b => {
        if (b.quantity > 0 && b.expiryDate <= ninetyDays) expiringSoonCount++;
      });
    });

    return {
      pendingRxCount: pendingRx.length,
      lowStockCount,
      expiringSoonCount,
      todaysDispensed: db.getAll('stockLedger').filter(l => l.type === 'DISPENSE' && l.createdAt.startsWith(today)).length,
      pendingRxList: pendingRx,
      lowStockList: lowStockList.sort((a,b) => a.stockLevel - b.stockLevel)
    };
  },

  // --- Lab Technician Dashboard Stats ---
  getLabStats() {
    const today = new Date().toISOString().split('T')[0];
    const orders = db.getAll('labOrders');
    
    const pending = orders.filter(o => o.status === 'ORDERED' || o.status === 'SAMPLE_COLLECTED');
    const inProgress = orders.filter(o => o.status === 'PROCESSING');
    const completedToday = orders.filter(o => o.status === 'COMPLETED' && o.completedAt.startsWith(today));
    
    const PRIORITY_SCORE = { 'Stat': 3, 'Urgent': 2, 'Routine': 1 };
    const queue = pending.concat(inProgress).sort((a, b) => {
      const pDiff = PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return {
      pendingCount: pending.length,
      inProgressCount: inProgress.length,
      completedTodayCount: completedToday.length,
      criticalTodayCount: completedToday.filter(o => o.isCritical).length,
      queueList: queue
    };
  },

  // --- General Report Generation ---
  generateReport(type, startDate, endDate) {
    if (type === 'appointments') {
      let appts = db.getAll('appointments');
      if (startDate) appts = appts.filter(a => a.date >= startDate);
      if (endDate) appts = appts.filter(a => a.date <= endDate);
      
      return appts.map(a => {
        const doc = db.getById('staff', a.doctorId);
        const dept = db.getById('departments', doc.departmentId);
        return {
          Date: a.date,
          Time: a.time,
          Department: dept ? dept.name : 'Unknown',
          Doctor: doc.name,
          Status: a.status,
          Type: a.type
        };
      });
    }

    if (type === 'revenue') {
      let payments = db.getAll('payments');
      if (startDate) payments = payments.filter(p => p.createdAt >= startDate + 'T00:00:00');
      if (endDate) payments = payments.filter(p => p.createdAt <= endDate + 'T23:59:59');
      
      return payments.map(p => ({
        Date: p.createdAt.split('T')[0],
        Amount: p.amount / 100,
        Method: p.method,
        BillID: p.billId,
        ReceivedBy: p.receivedBy
      }));
    }

    if (type === 'outstanding') {
      return db.getAll('bills')
        .filter(b => b.status === 'UNPAID' || b.status === 'PARTIAL')
        .map(b => ({
          BillID: b.id,
          Date: b.createdAt.split('T')[0],
          Patient: db.getById('patients', b.patientId).name,
          TotalAmount: b.totalAmount / 100,
          DueAmount: (b.totalAmount - b.paidAmount) / 100,
          Status: b.status
        }));
    }

    if (type === 'medicines') {
      let ledger = db.getAll('stockLedger').filter(s => s.type === 'DISPENSE');
      if (startDate) ledger = ledger.filter(l => l.createdAt >= startDate + 'T00:00:00');
      if (endDate) ledger = ledger.filter(l => l.createdAt <= endDate + 'T23:59:59');
      
      return ledger.map(l => {
        let patName = 'Unknown';
        // Try to find patient from referenceId (assuming it's a prescription id)
        try {
          const rx = db.getById('prescriptions', l.referenceId);
          patName = db.getById('patients', rx.patientId).name;
        } catch(e) {}
        
        return {
          Date: l.createdAt.split('T')[0],
          Medicine: db.getById('medicines', l.medicineId).name,
          Quantity: Math.abs(l.quantity), // dispensed qty is negative in ledger
          Patient: patName,
          Pharmacist: db.getById('staff', l.performedBy).name
        };
      });
    }

    if (type === 'lab') {
      let labs = db.getAll('labOrders');
      if (startDate) labs = labs.filter(l => l.createdAt >= startDate + 'T00:00:00');
      if (endDate) labs = labs.filter(l => l.createdAt <= endDate + 'T23:59:59');
      
      return labs.map(l => ({
        Date: l.createdAt.split('T')[0],
        Test: db.getById('labCatalog', l.testId).name,
        Priority: l.priority,
        Status: l.status,
        Doctor: db.getById('staff', l.doctorId).name
      }));
    }

    return [];
  },

  exportCSV(filename, dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    const headers = Object.keys(dataArray[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of dataArray) {
      csvRows.push(headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','));
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
};
