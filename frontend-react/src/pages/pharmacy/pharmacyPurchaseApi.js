import apiClient from '../../api/client';

const purchaseOrderUrl = (id) => `/purchase-orders/${encodeURIComponent(id)}/`;

const pharmacyPurchaseApi = {
  list: async (params = {}) => {
    const response = await apiClient.get('/purchase-orders/', { params });
    return response.data;
  },
  create: async (data) => {
    const response = await apiClient.post('/purchase-orders/', data);
    return response.data;
  },
  deliver: async (id, data) => {
    const response = await apiClient.post(`${purchaseOrderUrl(id)}deliver/`, data);
    return response.data;
  },
  stock: async (id) => {
    const response = await apiClient.post(`${purchaseOrderUrl(id)}stock/`);
    return response.data;
  },
  cancel: async (id) => {
    const response = await apiClient.post(`${purchaseOrderUrl(id)}cancel/`);
    return response.data;
  },
};

export default pharmacyPurchaseApi;
