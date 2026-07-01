export const QUERY_KEYS = {
  ME: ['me'],
  JOBS: (filters) => ['jobs', filters],
  JOB: (id) => ['job', id],
  APPLICATIONS: (filters) => ['applications', filters],
  INTERVIEWS: ['interviews'],
  RESUMES: ['resumes'],
  DASHBOARD: ['dashboard'],
  SCHEDULER_LOG: ['scheduler-log'],
};
