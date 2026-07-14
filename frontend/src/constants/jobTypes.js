export const LOCATION_TYPES = ['Remote', 'Onsite', 'Hybrid'];
export const EMPLOYMENT_TYPES = ['full-time', 'contract', 'part-time'];

export const MATCH_LABELS = {
  EXCELLENT: { label: 'Excellent', min: 85 },
  GOOD: { label: 'Good', min: 70 },
  FAIR: { label: 'Fair', min: 50 },
  LOW: { label: 'Low', min: 0 },
};

// Live sources for the platform filter. Remote pool + Karachi (mustakbil).
export const PLATFORMS = [
  'remotive', 'arbeitnow', 'himalayas', 'adzuna', 'jooble',
  'remoteok', 'weworkremotely', 'jsearch', 'workingnomads',
  'greenhouse', 'lever', 'ashby', 'mustakbil',
];

// Freshness filter — value is "posted within N days" ('' = any / full 30-day pool).
export const FRESHNESS_OPTIONS = [
  { value: '1', label: 'Posted: last 24h' },
  { value: '3', label: 'Posted: last 3 days' },
  { value: '7', label: 'Posted: last 7 days' },
  { value: '', label: 'Posted: any time' },
];
