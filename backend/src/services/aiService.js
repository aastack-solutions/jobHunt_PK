// services/aiService.js — Groq completions for the three AI features.
// The ONLY place Groq is called (routes enqueue; the worker invokes this).
// Model + token/temperature limits are pinned by backend/CLAUDE.md.
const Groq = require('groq-sdk');

const MODEL = 'llama3-8b-8192';
const TIMEOUT_MS = 30000;

let client;
function groq() {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

async function complete({ system, user, maxTokens, temperature }) {
  const res = await groq().chat.completions.create(
    {
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    },
    { timeout: TIMEOUT_MS }
  );
  const text = res.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty completion from Groq');
  return text;
}

// data: { jobTitle, company, descriptionSnippet, userName, skills[] }
async function coverLetter(data) {
  const skills = (data.skills || []).join(', ') || 'general software skills';
  const text = await complete({
    system: 'You write concise, professional, and specific cover letters. No placeholders, no markdown.',
    user:
      `Write a short cover letter (max ~200 words) for ${data.userName || 'the candidate'} applying to ` +
      `"${data.jobTitle}" at ${data.company}. Candidate skills: ${skills}. ` +
      `Job description excerpt: ${data.descriptionSnippet || 'N/A'}. Return only the letter body.`,
    maxTokens: 450,
    temperature: 0.7,
  });
  return { coverLetter: text };
}

// data: { description }
async function jobSummary(data) {
  const text = await complete({
    system: 'You summarize job descriptions into a few short bullet points. Return bullets only.',
    user: `Summarize this job description into 4-6 concise bullet points:\n\n${data.description || ''}`,
    maxTokens: 120,
    temperature: 0.2,
  });
  return { summary: text };
}

// data: { jobTitle, company, skills[] }
async function interviewPrep(data) {
  const skills = (data.skills || []).join(', ') || 'the role';
  const text = await complete({
    system: 'You produce practical interview prep questions — a mix of technical and behavioral.',
    user:
      `Give 6 interview preparation questions for a "${data.jobTitle}" role at ${data.company}, ` +
      `relevant to these skills: ${skills}. Mix technical and behavioral. Numbered list only.`,
    maxTokens: 220,
    temperature: 0.5,
  });
  return { questions: text };
}

async function generate(type, data) {
  switch (type) {
    case 'cover_letter':
      return coverLetter(data);
    case 'job_summary':
      return jobSummary(data);
    case 'interview_prep':
      return interviewPrep(data);
    default:
      throw new Error(`Unknown AI task type: ${type}`);
  }
}

module.exports = { generate };
