import api from '../lib/axios';
import { mockInterviews } from '../mocks/mockInterviews';

const USE_MOCK = true; // flip to false when backend is ready

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

let store = [...mockInterviews];

export async function getInterviews() {
  if (USE_MOCK) {
    await delay();
    return [...store].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }
  const { data } = await api.get('/interviews');
  return data;
}

export async function createInterview(payload) {
  if (USE_MOCK) {
    await delay();
    const created = { id: `int_${Date.now()}`, outcome: null, ...payload };
    store = [created, ...store];
    return created;
  }
  const { data } = await api.post('/interviews', payload);
  return data;
}

export async function updateInterview(id, updates) {
  if (USE_MOCK) {
    await delay();
    store = store.map((i) => (i.id === id ? { ...i, ...updates } : i));
    return store.find((i) => i.id === id);
  }
  const { data } = await api.patch(`/interviews/${id}`, updates);
  return data;
}
