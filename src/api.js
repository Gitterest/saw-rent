const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export const api = {
  health: () => request('/api/health'),
  getPublicSettings: () => request('/api/public/settings'),
  getPublicInventory: () => request('/api/public/inventory'),
  requestBooking: (payload) => request('/api/public/bookings/request', { method: 'POST', body: JSON.stringify(payload) }),
  adminLogin: (password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST' }),
  adminBootstrap: () => request('/api/admin/bootstrap'),
  updateSettings: (payload) => request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  createInventory: (payload) => request('/api/admin/inventory', { method: 'POST', body: JSON.stringify(payload) }),
  updateInventory: (id, payload) => request(`/api/admin/inventory/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteInventory: (id) => request(`/api/admin/inventory/${id}`, { method: 'DELETE' }),
  updateBookingStatus: (id, status) => request(`/api/admin/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
};
