import api from '../lib/axios';
import { mockJobs } from '../mocks/mockJobs';

const USE_MOCK = true; // flip to false when backend is ready

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

function applyFilters(jobs, filters = {}) {
  let result = [...jobs];
  const { locationType, platform, minScore, q, sort } = filters;

  if (locationType) result = result.filter((j) => j.locationType === locationType);
  if (platform) result = result.filter((j) => j.platform === platform);
  if (minScore) result = result.filter((j) => j.matchScore >= Number(minScore));
  if (q) {
    const term = q.toLowerCase();
    result = result.filter(
      (j) => j.title.toLowerCase().includes(term) || j.company.toLowerCase().includes(term)
    );
  }
  if (sort === 'distance') {
    result.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  } else {
    result.sort((a, b) => b.matchScore - a.matchScore);
  }
  return result;
}

export async function getJobs(filters = {}) {
  if (USE_MOCK) {
    await delay();
    return applyFilters(mockJobs, filters);
  }
  const { data } = await api.get('/jobs', { params: filters });
  return data;
}

export async function getJob(id) {
  if (USE_MOCK) {
    await delay();
    return mockJobs.find((j) => j.id === id) || null;
  }
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}
