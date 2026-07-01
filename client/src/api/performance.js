import api from '../lib/axios.js';

// Reviews
export const createReview = (body) => api.post('/performance/reviews', body).then((r) => r.data.review);
export const updateReview = (id, body) => api.put(`/performance/reviews/${id}`, body).then((r) => r.data.review);
export const listReviews = (params) => api.get('/performance/reviews', { params }).then((r) => r.data.data);
export const myReviews = () => api.get('/performance/reviews/mine').then((r) => r.data.data);

// Incentives
export const createIncentive = (body) => api.post('/performance/incentives', body).then((r) => r.data.incentive);
export const listIncentives = (params) => api.get('/performance/incentives', { params }).then((r) => r.data.data);
export const myIncentives = () => api.get('/performance/incentives/mine').then((r) => r.data.data);

// Appraisals
export const createAppraisal = (body) => api.post('/performance/appraisals', body).then((r) => r.data.appraisal);
export const listAppraisals = (params) => api.get('/performance/appraisals', { params }).then((r) => r.data.data);

// Training records (manual log)
export const createTrainingRecord = (body) => api.post('/performance/training-records', body).then((r) => r.data.record);
export const listTrainingRecords = (params) => api.get('/performance/training-records', { params }).then((r) => r.data.data);
export const myTrainingRecords = () => api.get('/performance/training-records/mine').then((r) => r.data.data);
