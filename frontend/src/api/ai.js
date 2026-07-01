import api from '../lib/axios';

const USE_MOCK = true; // flip to false when backend is ready

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// Tracks fake poll counts per mock jobId so status "completes" after 3 polls.
const mockPolls = {};

const MOCK_LETTER = `Dear Hiring Manager,

I am excited to apply for this role. With strong experience in React, Node.js, and
modern full-stack development, I am confident I can contribute from day one.

Your team's focus on quality and impact aligns closely with how I approach my work.
I would welcome the chance to discuss how my background fits your needs.

Best regards,
Ahmed Khan`;

export async function enqueueTask(type, payload) {
  if (USE_MOCK) {
    await delay();
    const jobId = `ai_${Date.now()}`;
    mockPolls[jobId] = 0;
    return { jobId };
  }
  const { data } = await api.post('/ai/enqueue', { type, payload });
  return data;
}

export async function getTaskStatus(jobId) {
  if (USE_MOCK) {
    await delay(200);
    mockPolls[jobId] = (mockPolls[jobId] || 0) + 1;
    if (mockPolls[jobId] >= 3) {
      return { status: 'completed', result: { coverLetter: MOCK_LETTER } };
    }
    return { status: 'active', result: null };
  }
  const { data } = await api.get(`/ai/status/${jobId}`);
  return data;
}
