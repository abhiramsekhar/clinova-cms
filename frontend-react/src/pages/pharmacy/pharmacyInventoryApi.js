import apiClient from '../../api/client';

const medicineUrl = (id) => `/medicines/${encodeURIComponent(id)}/`;

const medicinesApi = {
  list: async (params = {}) => {
    const response = await apiClient.get('/medicines/', { params });
    return response.data;
  },
  stockAlerts: async () => {
    const response = await apiClient.get('/medicines/stock-alerts/');
    return response.data;
  },
  create: async (data) => {
    const response = await apiClient.post('/medicines/', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await apiClient.patch(medicineUrl(id), data);
    return response.data;
  },
  restock: async (id, data) => {
    const response = await apiClient.post(`${medicineUrl(id)}restock/`, data);
    return response.data;
  },
  toggleActive: async (id) => {
    const response = await apiClient.post(`${medicineUrl(id)}toggle-active/`);
    return response.data;
  },
  removeExpired: async (id) => {
    const response = await apiClient.post(`${medicineUrl(id)}remove-expired/`);
    return response.data;
  },
};

export default medicinesApi;
