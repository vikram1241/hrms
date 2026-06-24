import api from '../lib/axios.js';

export const getDashboardStats = () => api.get('/dashboard/stats').then((r) => r.data.stats);
