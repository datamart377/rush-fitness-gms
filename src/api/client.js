// Tiny fetch wrapper used by the React app to talk to the backend.
// Always points directly at the backend on localhost:4000 unless the
// REACT_APP_API_URL env var is explicitly set to override it.
// (We don't rely on the CRA proxy because it requires a dev-server restart
// after package.json changes, which is fragile in practice.)

const BASE = (process.env.REACT_APP_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'rfg_token';

// Expose for in-browser debugging: type `window.__rfgApi.base` in DevTools.
if (typeof window !== 'undefined') {
  window.__rfgApi = { base: BASE };
}
// eslint-disable-next-line no-console
console.log('[api] backend base URL:', BASE);

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const REQUEST_TIMEOUT_MS = 15000;

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = auth.getToken();
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const url = `${BASE}/api${path.startsWith('/') ? '' : '/'}${path}`;

  // Time-bound the request so it can't hang forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Chain caller's signal so they can also cancel.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort());
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError → timeout, TypeError → network failure (CORS, server down, DNS)
    const friendly =
      err.name === 'AbortError'
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Cannot reach API at ${url} (${err.message}). Is the backend running on http://localhost:4000?`;
    // eslint-disable-next-line no-console
    console.error('[api] request failed:', { url, error: err });
    const wrapped = new Error(friendly);
    wrapped.cause = err;
    throw wrapped;
  }
  clearTimeout(timer);

  // 204 No Content
  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    if (res.status === 401) auth.clear();
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  get:    (p, opts)       => request(p, { ...opts, method: 'GET' }),
  post:   (p, body, opts) => request(p, { ...opts, method: 'POST', body }),
  patch:  (p, body, opts) => request(p, { ...opts, method: 'PATCH', body }),
  put:    (p, body, opts) => request(p, { ...opts, method: 'PUT', body }),
  delete: (p, opts)       => request(p, { ...opts, method: 'DELETE' }),
};

// ── Convenience wrappers grouped by resource ─────────────────────
export const authApi = {
  login:   (username, password) =>
    api.post('/auth/login', { username, password }).then((r) => {
      auth.setToken(r.token);
      return r;
    }),
  me:              ()                  => api.get('/auth/me'),
  changePassword:  (current, next)     => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
  register:        (payload)           => api.post('/auth/register', payload),
  logout:          ()                  => { auth.clear(); },
};

const resource = (path) => ({
  list:   (params)        => api.get(`${path}${qs(params)}`),
  get:    (id)            => api.get(`${path}/${id}`),
  create: (payload)       => api.post(path, payload),
  update: (id, payload)   => api.patch(`${path}/${id}`, payload),
  remove: (id)            => api.delete(`${path}/${id}`),
});

function qs(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export const membersApi     = { ...resource('/members'),
  verifyPin: (id, pin) => api.post(`/members/${id}/verify-pin`, { pin }),
};
export const trainersApi    = resource('/trainers');
export const plansApi       = resource('/plans');
export const membershipsApi = { ...resource('/memberships'),
  freeze:   (id, days) => api.post(`/memberships/${id}/freeze`, { days }),
  unfreeze: (id)       => api.post(`/memberships/${id}/unfreeze`),
  cancel:   (id)       => api.post(`/memberships/${id}/cancel`),
};
export const paymentsApi    = { ...resource('/payments'),
  refund: (id) => api.post(`/payments/${id}/refund`),
};
export const lockersApi     = { ...resource('/lockers'),
  assign:  (id, memberId) => api.post(`/lockers/${id}/assign`, { memberId }),
  release: (id)           => api.post(`/lockers/${id}/release`),
};
export const productsApi    = { ...resource('/products'),
  sell: (id, payload) => api.post(`/products/${id}/sell`, payload),
};
export const activitiesApi  = resource('/activities');
export const timetableApi   = resource('/timetable');
export const attendanceApi  = { ...resource('/attendance'),
  checkIn:  (payload) => api.post('/attendance/check-in', payload),
  checkOut: (id)      => api.post(`/attendance/${id}/check-out`),
};
export const walkInsApi     = { ...resource('/walk-ins'),
  checkIn: (id) => api.post(`/walk-ins/${id}/check-in`),
};
export const equipmentApi   = resource('/equipment');
export const discountsApi   = resource('/discounts');
export const expensesApi    = resource('/expenses');
export const usersApi       = resource('/users');
export const auditApi       = { list: (params) => api.get(`/audit-logs${qs(params)}`) };
export const dashboardApi   = { get: () => api.get('/dashboard') };

export default api;
