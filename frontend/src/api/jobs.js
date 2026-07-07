import api from '../lib/axios';

// Live backend. minScore + sort=score/distance are applied by the matching
// engine (Week 4); until then only locationType/platform/q reach the API, and
// jobs come back without a matchScore.
export async function getJobs(filters = {}) {
  const params = {};
  if (filters.locationType) params.locationType = filters.locationType;
  if (filters.platform) params.platform = filters.platform;
  if (filters.q) params.q = filters.q;
  const { data } = await api.get('/jobs', { params });
  return data;
}

export async function getJob(id) {
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}
