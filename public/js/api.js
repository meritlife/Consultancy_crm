/* Global API client — window.API */
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const options = { method, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, options);
    if (res.status === 401) {
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Not authenticated');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    auth: {
      me:       ()      => request('GET',  '/auth/me'),
      login:    (body)  => request('POST', '/auth/login',    body),
      register: (body)  => request('POST', '/auth/register', body),
      logout:   ()      => request('POST', '/auth/logout'),
    },
    records: {
      list:   (params) => request('GET',    '/records?' + new URLSearchParams(params || {})),
      create: (body)   => request('POST',   '/records',         body),
      update: (id, b)  => request('PUT',    `/records/${id}`,   b),
      remove: (id)     => request('DELETE', `/records/${id}`),
      bulk:   (body)   => request('POST',   '/records/bulk',    body),
    },
    agencies: {
      list:         ()     => request('GET',  '/agencies'),
      create:       (body) => request('POST', '/agencies',              body),
      toggleStatus: (id)   => request('PUT',  `/agencies/${id}/status`),
      remove:       (id)   => request('DELETE', `/agencies/${id}`),
    },
    employees: {
      list:   (params) => request('GET',    '/employees?' + new URLSearchParams(params || {})),
      create: (body)   => request('POST',   '/employees',       body),
      remove: (id)     => request('DELETE', `/employees/${id}`),
    },
    logs: {
      list:  (params) => request('GET',    '/logs?' + new URLSearchParams(params || {})),
      clear: ()       => request('DELETE', '/logs'),
    },
  };
})();
