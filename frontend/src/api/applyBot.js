import api from '../lib/axios';

export async function getApplyTasks() {
  const { data } = await api.get('/apply-tasks');
  return data;
}

export async function getApplyTaskDetail(id) {
  const { data } = await api.get(`/apply-tasks/${id}`);
  return data;
}

export async function getApplyCredentials() {
  const { data } = await api.get('/apply-credentials');
  return data;
}

export async function upsertApplyCredential(platform, payload) {
  const { data } = await api.put(`/apply-credentials/${platform}`, payload);
  return data;
}

export async function deleteApplyCredential(platform) {
  await api.delete(`/apply-credentials/${platform}`);
}
