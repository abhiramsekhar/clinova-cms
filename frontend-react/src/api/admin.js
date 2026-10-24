import apiClient from './client';

const resource = (name) => `/admin/${name}/`;

const getList = async (name, params = {}) => (await apiClient.get(resource(name), { params })).data;

export const adminApi = {
  dashboard: async () => (await apiClient.get(resource('dashboard'))).data,
  staff: (params) => getList('staff', params),
  users: (params) => getList('users', params),
  roles: (params) => getList('roles', params),
  departments: (params) => getList('departments', params),
  labCatalog: (params) => getList('lab-catalog', params),
  suppliers: (params) => getList('suppliers', params),
  globalSearch: async (query, config = {}) => (await apiClient.get(resource('search'), { params: { q: query }, ...config })).data,
  supplierRates: async (id) => (await apiClient.get(`${resource('suppliers')}${encodeURIComponent(id)}/rates/`)).data,
  auditLog: (params) => getList('audit-log', params),
  reports: async (params) => (await apiClient.get(resource('reports'), { params })).data,
  settings: async () => (await apiClient.get(resource('settings'))).data,
  create: async (name, data) => (await apiClient.post(resource(name), data)).data,
  update: async (name, id, data) => (await apiClient.patch(`${resource(name)}${encodeURIComponent(id)}/`, data)).data,
  deactivate: async (name, id) => (await apiClient.post(`${resource(name)}${encodeURIComponent(id)}/deactivate/`)).data,
  unlock: async (id) => (await apiClient.post(`${resource('users')}${encodeURIComponent(id)}/unlock/`)).data,
  resetPassword: async (id, password, confirmPassword) => (await apiClient.post(`${resource('users')}${encodeURIComponent(id)}/reset-password/`, { password, confirmPassword })).data,
  updateSettings: async (data) => (await apiClient.patch(resource('settings'), data)).data,
};
