export const mockDashboardStats = {
  totalApplications: 47,
  thisWeek: 8,
  interviewRate: 23, // percentage
  offerRate: 6, // percentage
  remoteCount: 31,
  karachiCount: 16,
};

export const mockFunnelData = {
  labels: ['Applied', 'Viewed', 'Phone Screen', 'Interview', 'Technical', 'Offer'],
  remote: [31, 18, 9, 6, 3, 2],
  karachi: [16, 10, 4, 3, 1, 0],
};

export const mockWeeklyData = {
  labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
  remote: [6, 8, 9, 8],
  karachi: [2, 4, 5, 5],
};

// Last scheduler run — recent so the alert stays hidden by default.
export const mockSchedulerLog = {
  lastRunAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};
