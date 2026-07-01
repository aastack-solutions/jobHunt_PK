import api from '../lib/axios';

// Live backend. Sessions are cookie-based (axios sends credentials).

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
}

export async function register(email, password, fullName) {
  const { data } = await api.post('/auth/register', { email, password, fullName });
  return data;
}

export async function logout() {
  const { data } = await api.post('/auth/logout');
  return data;
}

export async function getMe() {
  // 401 simply means "not signed in" — resolve to null instead of throwing.
  try {
    const { data } = await api.get('/auth/me');
    return data;
  } catch (err) {
    if (err.response && err.response.status === 401) return null;
    throw err;
  }
}
