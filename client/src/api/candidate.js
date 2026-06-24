import api from '../lib/axios.js';

export const getOfferByToken = (token) => api.get(`/candidate/offer/${token}`).then((r) => r.data);
export const signOffer = (token, signatureBase64) =>
  api.post(`/candidate/offer/${token}/sign`, { signatureBase64 }).then((r) => r.data);
export const setupPassword = (token, password) =>
  api.post('/candidate/setup-password', { token, password }).then((r) => r.data);
