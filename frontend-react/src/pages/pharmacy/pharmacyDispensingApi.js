import apiClient from '../../api/client';

const prescriptionUrl = (id) => `/pharmacy-prescriptions/${encodeURIComponent(id)}/dispense/`;

const pharmacyDispensingApi = {
  preview: async (id) => {
    const response = await apiClient.get(prescriptionUrl(id));
    return response.data;
  },
  dispense: async (id, data) => {
    const response = await apiClient.post(prescriptionUrl(id), data);
    return response.data;
  },
};

export default pharmacyDispensingApi;
