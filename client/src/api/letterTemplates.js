import api from '../lib/axios.js';

export const listLetterTemplates = (params) => api.get('/letter-templates', { params }).then((r) => r.data);
export const createLetterTemplate = (body) => api.post('/letter-templates', body).then((r) => r.data.template);
export const updateLetterTemplate = (id, body) => api.put(`/letter-templates/${id}`, body).then((r) => r.data.template);
export const deleteLetterTemplate = (id) => api.delete(`/letter-templates/${id}`).then((r) => r.data);

export const LETTER_TYPE_LABELS = {
  OfferLetter: 'Offer Letter',
  AppointmentLetter: 'Appointment Letter',
  ServiceLetter: 'Service Letter',
  FNFLetter: 'Full & Final (FNF) Letter'
};
