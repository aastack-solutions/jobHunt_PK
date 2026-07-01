import api from '../lib/axios';

// Only these fields are accepted by PATCH /users/me/preferences (strict schema).
const ALLOWED = [
  'fullName',
  'timezone',
  'wantsRemote',
  'wantsOnsiteKarachi',
  'homeArea',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
];

export async function updatePreferences(updates) {
  const payload = {};
  for (const key of ALLOWED) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  }
  const { data } = await api.patch('/users/me/preferences', payload);
  return data;
}
