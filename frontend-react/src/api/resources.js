import apiClient from './client';
import { normalizeError } from './errors';

export const notificationsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/notifications/', { params });
    return res.data;
  },

  markRead: async (id) => {
    const res = await apiClient.patch(`/notifications/${id}/read/`);
    return res.data;
  },

  markAllRead: async () => {
    const res = await apiClient.post('/notifications/mark-all-read/');
    return res.data;
  },
};

export const dashboardApi = {
  reception: async () => {
    const res = await apiClient.get('/dashboard/reception/');
    return res.data;
  },
  doctor: async () => {
    const res = await apiClient.get('/dashboard/doctor/');
    return res.data;
  },
  pharmacy: async () => {
    const res = await apiClient.get('/dashboard/pharmacy/');
    return res.data;
  },
  lab: async () => {
    const res = await apiClient.get('/dashboard/lab/');
    return res.data;
  },
  admin: async () => {
    const res = await apiClient.get('/dashboard/admin/');
    return res.data;
  },
};

export const patientsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/patients/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/patients/${id}/`);
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post('/patients/', data);
    return res.data;
  },
  registerAndPay: async (data) => {
    const res = await apiClient.post('/patients/register-and-pay/', data);
    return res.data;
  },
  precheck: async (data) => {
    const res = await apiClient.post('/patients/precheck/', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await apiClient.patch(`/patients/${id}/`, data);
    return res.data;
  },
  clinicalHistory: async (id) => {
    const res = await apiClient.get(`/patients/${id}/clinical-history/`);
    return res.data;
  },
};

export const appointmentsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/appointments/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/appointments/${id}/`);
    return res.data;
  },
  book: async (data) => {
    const res = await apiClient.post('/appointments/book/', data);
    return res.data;
  },
  bookAndPay: async (data) => {
    const res = await apiClient.post('/appointments/book-and-pay/', data);
    return res.data;
  },
  cancel: async (id, data) => {
    const res = await apiClient.post(`/appointments/${id}/cancel/`, data);
    return res.data;
  },
  checkIn: async (id) => {
    const res = await apiClient.post(`/appointments/${id}/check-in/`);
    return res.data;
  },
  noShow: async (id) => {
    const res = await apiClient.post(`/appointments/${id}/no-show/`);
    return res.data;
  },
  updateStatus: async (id, data) => {
    const res = await apiClient.post(`/appointments/${id}/update-status/`, data);
    return res.data;
  },
  slotBoard: async (params = {}) => {
    const res = await apiClient.get('/appointments/slot-board/', { params });
    return res.data;
  },
  nextWalkinSlot: async (params = {}) => {
    const res = await apiClient.get('/appointments/next-walkin-slot/', { params });
    return res.data;
  },
  consultationFee: async (params = {}) => {
    const res = await apiClient.get('/appointments/consultation-fee/', { params });
    return res.data;
  },
};

export const consultationsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/consultations/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/consultations/${encodeURIComponent(id)}/`);
    return res.data;
  },
  getOrCreate: async (data) => {
    const res = await apiClient.post('/consultations/get-or-create/', data);
    return res.data;
  },
  saveDraft: async (id, data) => {
    const res = await apiClient.patch(`/consultations/${encodeURIComponent(id)}/save-draft/`, data);
    return res.data;
  },
  complete: async (id, data = {}) => {
    const res = await apiClient.post(`/consultations/${encodeURIComponent(id)}/complete/`, data);
    return res.data;
  },
  addendum: async (id, data) => {
    const res = await apiClient.post(`/consultations/${encodeURIComponent(id)}/addendum/`, data);
    return res.data;
  },
};

export const prescriptionsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/prescriptions/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/prescriptions/${encodeURIComponent(id)}/`);
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post('/prescriptions/', data);
    return res.data;
  },
  cancel: async (id, data = {}) => {
    const res = await apiClient.post(`/prescriptions/${encodeURIComponent(id)}/cancel/`, data);
    return res.data;
  },
};

export const labOrdersApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/lab-orders/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/lab-orders/${encodeURIComponent(id)}/`);
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post('/lab-orders/', data);
    return res.data;
  },
  cancel: async (id, data = {}) => {
    const res = await apiClient.post(`/lab-orders/${encodeURIComponent(id)}/cancel/`, data);
    return res.data;
  },
};

export const staffApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/staff/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/staff/${id}/`);
    return res.data;
  },
  doctors: async () => {
    const res = await apiClient.get('/staff/doctors/');
    return res.data;
  },
};

export const billsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/bills/', { params });
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/bills/${id}/`);
    return res.data;
  },
  receivePayment: async (id, data) => {
    const res = await apiClient.post(`/bills/${id}/receive-payment/`, data);
    return res.data;
  },
  payments: async (id) => {
    const res = await apiClient.get(`/bills/${id}/payments/`);
    return res.data;
  },
};

export const departmentsApi = {
  list: async (params = {}) => {
    const res = await apiClient.get('/departments/', { params });
    return res.data;
  },
};
