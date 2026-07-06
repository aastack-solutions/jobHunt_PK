import api from '../lib/axios';
import { mockApplications } from '../mocks/mockApplications';

const USE_MOCK = false; // live backend (Week 5)

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

let store = [...mockApplications];

export async function getApplications(filters = {}) {
  if (USE_MOCK) {
    await delay();
    let result = [...store];
    if (filters.status) result = result.filter((a) => a.status === filters.status);
    if (filters.locationType) result = result.filter((a) => a.locationType === filters.locationType);
    return result;
  }
  const { data } = await api.get('/applications', { params: filters });
  return data;
}

export async function createApplication(payload) {
  if (USE_MOCK) {
    await delay();
    const created = { id: `app_${Date.now()}`, status: 'applied', ...payload };
    store = [created, ...store];
    return created;
  }
  const { data } = await api.post('/applications', payload);
  return data;
}

export async function updateApplication(id, updates) {
  if (USE_MOCK) {
    await delay();
    store = store.map((a) => (a.id === id ? { ...a, ...updates } : a));
    return store.find((a) => a.id === id);
  }
  const { data } = await api.patch(`/applications/${id}`, updates);
  return data;
}

export async function exportCsv() {
  if (USE_MOCK) {
    await delay();
    const header = 'id,jobTitle,company,status,appliedAt\n';
    const rows = store
      .map((a) => `${a.id},${a.jobTitle},${a.company},${a.status},${a.appliedAt}`)
      .join('\n');
    return new Blob([header + rows], { type: 'text/csv' });
  }
  const { data } = await api.get('/applications/export', { responseType: 'blob' });
  return data;
}
