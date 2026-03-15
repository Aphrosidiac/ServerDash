const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
  clearTimeout(timeout);

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // Servers
  getServers: () => request('/servers'),
  getServer: (id) => request(`/servers/${id}`),
  createServer: (body) => request('/servers', { method: 'POST', body }),
  updateServer: (id, body) => request(`/servers/${id}`, { method: 'PUT', body }),
  deleteServer: (id) => request(`/servers/${id}`, { method: 'DELETE' }),
  testServer: (id) => request(`/servers/${id}/test`, { method: 'POST' }),
  getServerStats: (id) => request(`/servers/${id}/stats`),
  getServerProcesses: (id) => request(`/servers/${id}/processes`),
  getServerFiles: (id, path) => request(`/servers/${id}/files?path=${encodeURIComponent(path)}`),
  getServerProjects: (id) => request(`/servers/${id}/projects`),
  getFileContent: (id, path) => request(`/servers/${id}/read`, { method: 'POST', body: { path } }),
  saveFileContent: (id, path, content) => request(`/servers/${id}/write`, { method: 'POST', body: { path, content } }),
  execServerCommand: (id, command) => request(`/servers/${id}/exec`, { method: 'POST', body: { command } }),

  // Projects
  getProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (body) => request('/projects', { method: 'POST', body }),
  updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  deployProject: (id) => request(`/projects/${id}/deploy`, { method: 'POST' }),
  runUpdate: (id) => request(`/projects/${id}/update`, { method: 'POST' }),
  execCommand: (id, command) => request(`/projects/${id}/exec`, { method: 'POST', body: { command } }),
  getProjectLogs: (id) => request(`/projects/${id}/logs`),
  checkStatus: (id) => request(`/projects/${id}/status`, { method: 'POST' }),
};
