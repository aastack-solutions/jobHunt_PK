import api from '../lib/axios';

// Live backend. All filters/sorting are applied server-side against the user's
// JobMatch rows joined to Job.
export async function getJobs(filters = {}) {
  const params = {};
  if (filters.locationType) params.locationType = filters.locationType;
  if (filters.platform) params.platform = filters.platform;
  if (filters.q) params.q = filters.q;
  if (filters.minScore) params.minScore = filters.minScore;
  if (filters.sort) params.sort = filters.sort;
  if (filters.postedWithinDays) params.postedWithinDays = filters.postedWithinDays;
  const { data } = await api.get('/jobs', { params });
  return data;
}

export async function getJob(id) {
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}
