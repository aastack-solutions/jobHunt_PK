// 3 interviews within the next 7 days: 1 video, 1 onsite, 1 phone.
const day = 24 * 60 * 60 * 1000;
const future = (days, hour) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const mockInterviews = [
  {
    id: 'int_001', applicationId: 'app_004', jobTitle: 'Frontend Developer (Hybrid)',
    company: 'Fintech Karachi', interviewType: 'video',
    scheduledAt: future(1, 15), meetingLink: 'https://meet.google.com/abc-defg-hij',
    officeAddress: null, outcome: null, notes: 'Second round with the engineering lead.',
  },
  {
    id: 'int_002', applicationId: 'app_003', jobTitle: 'MERN Stack Developer',
    company: 'Systems Ltd', interviewType: 'onsite',
    scheduledAt: future(3, 11), meetingLink: null,
    officeAddress: 'Plot 12, Shahrah-e-Faisal, Karachi', outcome: null,
    notes: 'Bring printed CV and portfolio.',
  },
  {
    id: 'int_003', applicationId: 'app_005', jobTitle: 'Node.js Backend Developer',
    company: 'CloudScale', interviewType: 'phone',
    scheduledAt: future(5, 18), meetingLink: null, officeAddress: null,
    outcome: null, notes: 'Initial recruiter call, 30 minutes.',
  },
];
