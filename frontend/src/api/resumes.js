import api from '../lib/axios';

// Live backend resume endpoints.

const EMPTY_RESUME = {
  id: null,
  fileName: null,
  skills: [],
  experienceYears: 0,
  seniorityLevel: 'junior',
  isImageBased: false,
  parseWarning: null,
  uploadedAt: null,
};

export async function getResume() {
  // No resume yet (404) → return an empty shape so the page still renders.
  try {
    const { data } = await api.get('/resumes/current');
    return data;
  } catch (err) {
    if (err.response && err.response.status === 404) return EMPTY_RESUME;
    throw err;
  }
}

export async function getResumeHistory() {
  const { data } = await api.get('/resumes');
  return data;
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append('file', file);
  // Content-Type undefined lets the browser set the multipart boundary.
  const { data } = await api.post('/resumes/upload', form, {
    headers: { 'Content-Type': undefined },
  });
  return data;
}

export async function updateSkills(skills) {
  const { data } = await api.patch('/resumes/skills', { skills });
  return data;
}
