/**
 * MIKROTIK REST API CLIENT (FRONTEND CONNECTOR)
 * Berkomunikasi dengan Flask Backend yang mem-proxy ke MikroTik RouterOS v7 REST API.
 */

const API = {
  async request(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
          // Sesi expired atau belum login
          window.dispatchEvent(new CustomEvent('mikrotik:unauthorized'));
        }
        throw new Error(data.message || data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // --- AUTH ---
  login(payload) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },

  checkAuthStatus() {
    return this.request('/api/auth/status');
  },

  // --- DASHBOARD & MONITORING ---
  getDashboardSummary() {
    return this.request('/api/dashboard/summary');
  },

  getTraffic() {
    return this.request('/api/monitoring/traffic');
  },

  getResources() {
    return this.request('/api/monitoring/resources');
  },

  getConnections(limit = 40) {
    return this.request(`/api/monitoring/connections?limit=${limit}`);
  },

  getLogs(limit = 50) {
    return this.request(`/api/monitoring/logs?limit=${limit}`);
  },

  // --- INTERFACES ---
  getInterfaces() {
    return this.request('/api/interfaces');
  },

  toggleInterface(id, disabled) {
    return this.request(`/api/interfaces/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ disabled })
    });
  },

  // --- IP ADDRESSES ---
  getIpAddresses() {
    return this.request('/api/ip/addresses');
  },

  addIpAddress(address, iface, comment) {
    return this.request('/api/ip/addresses', {
      method: 'POST',
      body: JSON.stringify({ address, interface: iface, comment })
    });
  },

  updateIpAddress(id, address, iface, comment) {
    return this.request(`/api/ip/addresses/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify({ address, interface: iface, comment })
    });
  },

  deleteIpAddress(id) {
    return this.request(`/api/ip/addresses/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // --- DHCP LEASES & POOLS ---
  getDhcpServers() {
    return this.request('/api/ip/dhcp-servers');
  },

  getDhcpLeases() {
    return this.request('/api/ip/dhcp-leases');
  },

  addDhcpLease(address, mac, comment) {
    return this.request('/api/ip/dhcp-leases', {
      method: 'POST',
      body: JSON.stringify({ address, mac_address: mac, comment })
    });
  },

  updateDhcpLease(id, address, mac, comment) {
    return this.request(`/api/ip/dhcp-leases/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify({ address, mac_address: mac, comment })
    });
  },

  deleteDhcpLease(id) {
    return this.request(`/api/ip/dhcp-leases/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  getIpPools() {
    return this.request('/api/ip/pools');
  },

  addIpPool(name, ranges) {
    return this.request('/api/ip/pools', {
      method: 'POST',
      body: JSON.stringify({ name, ranges })
    });
  },

  updateIpPool(id, name, ranges) {
    return this.request(`/api/ip/pools/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify({ name, ranges })
    });
  },

  deleteIpPool(id) {
    return this.request(`/api/ip/pools/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // --- DNS ---
  getDns() {
    return this.request('/api/ip/dns');
  },

  updateDns(servers, allowRemote) {
    return this.request('/api/ip/dns', {
      method: 'POST',
      body: JSON.stringify({ servers, allow_remote_requests: allowRemote })
    });
  },

  // --- FIREWALL ---
  getFirewallFilters() {
    return this.request('/api/firewall/filters');
  },

  addFirewallFilter(payload) {
    return this.request('/api/firewall/filters', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateFirewallFilter(id, payload) {
    return this.request(`/api/firewall/filters/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteFirewallFilter(id) {
    return this.request(`/api/firewall/filters/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  getFirewallNats() {
    return this.request('/api/firewall/nats');
  },

  addFirewallNat(payload) {
    return this.request('/api/firewall/nats', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateFirewallNat(id, payload) {
    return this.request(`/api/firewall/nats/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteFirewallNat(id) {
    return this.request(`/api/firewall/nats/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // --- HOTSPOT ---
  getHotspotActive() {
    return this.request('/api/hotspot/active');
  },

  getHotspotUsers() {
    return this.request('/api/hotspot/users');
  },

  addHotspotUser(payload) {
    return this.request('/api/hotspot/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateHotspotUser(id, payload) {
    return this.request(`/api/hotspot/users/${encodeURIComponent(id)}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteHotspotUser(id) {
    return this.request(`/api/hotspot/users/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // --- SYSTEM ---
  setIdentity(name) {
    return this.request('/api/system/identity', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  rebootRouter() {
    return this.request('/api/system/reboot', { method: 'POST' });
  }
};
