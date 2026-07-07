import api from '../lib/axios';
import {
  mockDashboardStats,
  mockFunnelData,
  mockWeeklyData,
  mockSchedulerLog,
} from '../mocks/mockDashboard';

const USE_MOCK = false; // live backend (Week 6)

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function getDashboardStats() {
  if (USE_MOCK) {
    await delay();
    return {
      stats: mockDashboardStats,
      funnel: mockFunnelData,
      weekly: mockWeeklyData,
      schedulerLog: mockSchedulerLog,
    };
  }
  const { data } = await api.get('/dashboard');
  return data;
}
