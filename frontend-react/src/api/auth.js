import apiClient from './client';

export const authApi = {
  login: async (username, password) => {
    const response = await apiClient.post('/auth/login/', { username, password });
    return response.data;
  },

  logout: async (refreshToken) => {
    try {
      await apiClient.post('/auth/logout/', { refresh: refreshToken });
    } catch {
      // Discard client-side even if backend returns error
    }
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me/');
    return response.data;
  },
};
