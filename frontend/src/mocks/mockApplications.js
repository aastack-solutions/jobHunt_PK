// 8 applications covering all statuses, each linked to a mockJobs id.
export const mockApplications = [
  {
    id: 'app_001', jobId: 'job_001', jobTitle: 'Senior React Engineer',
    company: 'Vercel', locationType: 'Remote', status: 'applied',
    appliedAt: '2026-06-20T09:00:00Z', notes: 'Submitted via referral from a former colleague at the company.',
  },
  {
    id: 'app_002', jobId: 'job_002', jobTitle: 'Full Stack Developer',
    company: 'Remote Co', locationType: 'Remote', status: 'viewed',
    appliedAt: '2026-06-18T10:30:00Z', notes: 'Recruiter opened the application within a day.',
  },
  {
    id: 'app_003', jobId: 'job_006', jobTitle: 'MERN Stack Developer',
    company: 'Systems Ltd', locationType: 'Onsite', status: 'phone_screen',
    appliedAt: '2026-06-15T08:00:00Z', notes: 'Phone screen scheduled with HR for next week.',
  },
  {
    id: 'app_004', jobId: 'job_009', jobTitle: 'Frontend Developer (Hybrid)',
    company: 'Fintech Karachi', locationType: 'Hybrid', status: 'interview',
    appliedAt: '2026-06-12T11:00:00Z', notes: 'First interview went well, awaiting next round.',
  },
  {
    id: 'app_005', jobId: 'job_004', jobTitle: 'Node.js Backend Developer',
    company: 'CloudScale', locationType: 'Remote', status: 'technical',
    appliedAt: '2026-06-10T14:00:00Z', notes: 'Take-home technical test due Friday.',
  },
  {
    id: 'app_006', jobId: 'job_007', jobTitle: 'Software Engineer',
    company: 'TechHive Karachi', locationType: 'Onsite', status: 'offer',
    appliedAt: '2026-06-05T09:00:00Z', notes: 'Verbal offer received, reviewing the contract terms.',
  },
  {
    id: 'app_007', jobId: 'job_005', jobTitle: 'Junior Web Developer',
    company: 'StartupX', locationType: 'Remote', status: 'rejected',
    appliedAt: '2026-06-03T10:00:00Z', notes: 'Position filled internally.',
  },
  {
    id: 'app_008', jobId: 'job_008', jobTitle: 'PHP Developer',
    company: 'WebWorks PK', locationType: 'Onsite', status: 'withdrawn',
    appliedAt: '2026-06-01T08:30:00Z', notes: 'Withdrew, salary below expectations.',
  },
];
