import api from '../lib/axios.js';

export const listExits = (params) => api.get('/exits', { params }).then((r) => r.data.data);
export const getExit = (id) => api.get(`/exits/${id}`).then((r) => r.data.record);
export const initiateExit = (body) => api.post('/exits', body).then((r) => r.data.record);
export const updateExit = (id, body) => api.patch(`/exits/${id}`, body).then((r) => r.data.record);
export const generateExitLetters = (id) => api.post(`/exits/${id}/letters`).then((r) => r.data);
