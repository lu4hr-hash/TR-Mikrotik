/**
 * MIKROTIK REST API WEB DASHBOARD
 * Core UI Logic, Realtime Chart.js, Polling, Form Handlers & Glassmorphism UX
 */

// --- GLOBAL APPLICATION STATE ---
const AppState = {
  currentTab: 'tab-dashboard',
  currentSubTab: 'mon-traffic',
  currentConfigTab: 'cfg-ip',
  pollIntervalMs: 5000,
  pollTimer: null,
  isPolling: false,
  selectedTrafficInterface: 'all',
  lastTrafficSample: {},
  trafficChart: null,
  resourceChart: null,
  chartHistoryLength: 20,
  chartsInitialized: false,
  currentInterfaces: [],
  logsCache: []
};

// --- INITIALIZATION ON DOM READY ---
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  checkAuth();
});

// Listener saat sesi habis / unauthorized
window.addEventListener('mikrotik:unauthorized', () => {
  stopPolling();
  showLoginView();
  showToast('Sesi Anda telah berakhir. Silakan login kembali.', 'warning');
});

function setupEventListeners() {
  // Tutup modal saat user menekan tombol ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  });

  // Tutup modal saat backdrop diklik
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}

// ==================== AUTHENTICATION & SESSION ====================

async function checkAuth() {
  try {
    const status = await API.checkAuthStatus();
    if (status && status.authenticated) {
      updateNavbarInfo(status);
      showAppView();
      initCharts();
      startPolling();
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login-submit');
  const btnText = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-loader');

  const payload = {
    host: document.getElementById('login-host').value.trim(),
    port: parseInt(document.getElementById('login-port').value, 10),
    username: document.getElementById('login-username').value.trim(),
    password: document.getElementById('login-password').value,
    use_ssl: document.getElementById('login-ssl').checked,
    demo_mode: document.getElementById('login-demo').checked
  };

  btn.disabled = true;
  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const res = await API.login(payload);
    showToast(res.message || 'Berhasil masuk ke MikroTik', 'success');
    updateNavbarInfo(res.session);
    showAppView();
    initCharts();
    startPolling();
  } catch (err) {
    showToast(err.message || 'Gagal terhubung ke router', 'error');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

async function handleLogout() {
  try {
    await API.logout();
    stopPolling();
    showToast('Anda telah logout', 'info');
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    showLoginView();
  }
}

function handleSslToggle() {
  const isSsl = document.getElementById('login-ssl').checked;
  const label = document.getElementById('ssl-label-text');
  const portInput = document.getElementById('login-port');
  
  if (isSsl) {
    label.textContent = 'HTTPS (SSL)';
    if (portInput.value === '80') portInput.value = '443';
  } else {
    label.textContent = 'HTTP (Biasa)';
    if (portInput.value === '443') portInput.value = '80';
  }
}

function togglePasswordVisibility(id) {
  const input = document.getElementById(id);
  const icon = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

function updateNavbarInfo(data) {
  document.getElementById('top-identity-name').textContent = data.identity || 'MikroTik';
  document.getElementById('top-model-name').textContent = data.board || data.model || 'RouterBoard';
  document.getElementById('top-ros-version').textContent = data.version || 'v7';
  
  document.getElementById('side-host').textContent = data.host || '-';
  const modeBadge = document.getElementById('side-mode');
  if (data.demo_mode) {
    modeBadge.textContent = 'Simulasi Lab';
    modeBadge.className = 'badge-mode text-cyan';
  } else {
    modeBadge.textContent = 'REST API';
    modeBadge.className = 'badge-mode';
  }
}

function showLoginView() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('view-app').classList.add('hidden');
}

function showAppView() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-app').classList.remove('hidden');
  setTimeout(() => {
    if (AppState.trafficChart) AppState.trafficChart.resize();
    if (AppState.resourceChart) AppState.resourceChart.resize();
  }, 100);
}

// ==================== NAVIGATION TABS & DRAWER ====================

function switchTab(tabId, subTarget = null) {
  AppState.currentTab = tabId;

  // Update Sidebar active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update Mobile Bottom Nav active state
  document.querySelectorAll('.mob-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Show Active Tab Pane
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add('active');

  // Close mobile sidebar if open
  closeSidebar();

  // If subtarget provided (e.g. from shortcut button)
  if (subTarget && tabId === 'tab-config') {
    switchConfigTab(subTarget);
  }

  // Trigger immediate refresh for the current view
  triggerManualRefresh();

  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
}

function switchSubTab(subTabId) {
  AppState.currentSubTab = subTabId;
  const parent = document.getElementById('tab-monitoring');
  parent.querySelectorAll('.subnav-pill').forEach((btn, idx) => {
    const ids = ['mon-traffic', 'mon-resources', 'mon-connections', 'mon-leases', 'mon-logs'];
    btn.classList.toggle('active', ids[idx] === subTabId);
  });

  parent.querySelectorAll('.subtab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const target = document.getElementById(subTabId);
  if (target) target.classList.add('active');

  // Resize charts jika subtab yang dibuka berisi chart
  if (subTabId === 'mon-resources' && AppState.resourceChart) {
    setTimeout(() => AppState.resourceChart.resize(), 50);
  }

  triggerManualRefresh();

  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
}

function switchConfigTab(cfgTabId) {
  AppState.currentConfigTab = cfgTabId;
  const parent = document.getElementById('tab-config');
  parent.querySelectorAll('.subnav-pill').forEach((btn, idx) => {
    const ids = ['cfg-ip', 'cfg-iface', 'cfg-dhcp', 'cfg-dns', 'cfg-firewall', 'cfg-system'];
    btn.classList.toggle('active', ids[idx] === cfgTabId);
  });

  parent.querySelectorAll('.config-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const target = document.getElementById(cfgTabId);
  if (target) target.classList.add('active');

  triggerManualRefresh();

  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  sidebar.classList.toggle('open');
}

function closeSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

// ==================== POLLING & REFRESH ENGINE ====================

function startPolling() {
  stopPolling();
  if (AppState.pollIntervalMs > 0) {
    AppState.pollTimer = setInterval(pollCycle, AppState.pollIntervalMs);
  }
  // Jalankan segera siklus pertama
  pollCycle();
}

function stopPolling() {
  if (AppState.pollTimer) {
    clearInterval(AppState.pollTimer);
    AppState.pollTimer = null;
  }
}

function changeRefreshRate(val) {
  AppState.pollIntervalMs = parseInt(val, 10);
  startPolling();
  if (AppState.pollIntervalMs > 0) {
    showToast(`Refresh otomatis disetel ke ${AppState.pollIntervalMs / 1000} detik`, 'info');
  } else {
    showToast('Refresh otomatis dijeda (Pause)', 'warning');
  }
}

async function triggerManualRefresh() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('fa-spin');
  await pollCycle();
  if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 600);
}

async function pollCycle() {
  if (AppState.isPolling) return;
  AppState.isPolling = true;

  try {
    // 1. Dashboard summary selalu diperbarui untuk status bar & widget atas
    const summary = await API.getDashboardSummary();
    renderSummary(summary);

    // 2. Refresh berdasarkan tab yang sedang aktif
    if (AppState.currentTab === 'tab-dashboard') {
      const traffic = await API.getTraffic();
      renderDashboardTraffic(traffic.interfaces || []);
    } else if (AppState.currentTab === 'tab-monitoring') {
      await pollMonitoringTab();
    } else if (AppState.currentTab === 'tab-config') {
      await pollConfigTab();
    } else if (AppState.currentTab === 'tab-hotspot') {
      await pollHotspotTab();
    }
  } catch (err) {
    console.error('Polling cycle error:', err);
  } finally {
    AppState.isPolling = false;
  }
}

// ==================== DASHBOARD RENDERING ====================

function renderSummary(data) {
  if (!data) return;

  // Stat Cards
  document.getElementById('card-cpu-load').textContent = `${data.cpu_load}%`;
  document.getElementById('card-cpu-info').textContent = `${data.cpu_cores} Cores @ ${data.cpu_freq}MHz`;
  document.getElementById('bar-cpu').style.width = `${Math.min(data.cpu_load, 100)}%`;

  document.getElementById('card-ram-percent').textContent = `${data.memory.percent}%`;
  document.getElementById('card-ram-info').textContent = `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`;
  document.getElementById('bar-ram').style.width = `${data.memory.percent}%`;

  document.getElementById('card-hdd-percent').textContent = `${data.hdd.percent}%`;
  document.getElementById('card-hdd-info').textContent = `${formatBytes(data.hdd.used)} / ${formatBytes(data.hdd.total)}`;
  document.getElementById('bar-hdd').style.width = `${data.hdd.percent}%`;

  document.getElementById('card-iface-active').textContent = data.interface_stats.running;
  document.getElementById('card-iface-total').textContent = `Total ${data.interface_stats.total} Interface (${data.interface_stats.disabled} nonaktif)`;

  document.getElementById('badge-dhcp-count').textContent = `${data.dhcp_lease_count} Leases`;
  document.getElementById('badge-ip-count').textContent = `${data.ip_address_count} IPs`;

  // Hardware Specs
  document.getElementById('spec-identity').textContent = data.identity;
  document.getElementById('spec-model').textContent = data.model;
  document.getElementById('spec-serial').textContent = data.serial;
  document.getElementById('spec-version').textContent = data.firmware;
  document.getElementById('spec-uptime').textContent = data.uptime;
  document.getElementById('spec-cpu').textContent = data.cpu_model;

  // Side and Top Identity
  document.getElementById('top-identity-name').textContent = data.identity;
  document.getElementById('top-model-name').textContent = data.model;
  document.getElementById('side-uptime').textContent = data.uptime;

  // Push data ke Resource History Chart
  pushResourceChartData(data.cpu_load, data.memory.percent);
}

function renderDashboardTraffic(interfaces) {
  AppState.currentInterfaces = interfaces;
  populateInterfaceSelects(interfaces);

  // Hitung total Rx & Tx Bps
  let totalRxBps = 0;
  let totalTxBps = 0;

  const tbody = document.getElementById('table-dashboard-interfaces');
  if (!interfaces || interfaces.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Tidak ada interface yang ditemukan</td></tr>`;
    return;
  }

  let html = '';
  interfaces.forEach(iface => {
    const isRunning = iface.running;
    const isDisabled = iface.disabled;
    const rxBps = iface.rx_bps || 0;
    const txBps = iface.tx_bps || 0;

    if (AppState.selectedTrafficInterface === 'all' || AppState.selectedTrafficInterface === iface.name) {
      totalRxBps += rxBps;
      totalTxBps += txBps;
    }

    let statusBadge = '<span class="badge-status inactive"><i class="fa-solid fa-circle-xmark"></i> Disabled</span>';
    if (!isDisabled) {
      statusBadge = isRunning 
        ? '<span class="badge-status active"><i class="fa-solid fa-circle-check"></i> Running</span>'
        : '<span class="badge-status inactive"><i class="fa-solid fa-circle-pause"></i> No Link</span>';
    }

    html += `
      <tr>
        <td>${statusBadge}</td>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(iface.name)}</span></td>
        <td><span class="badge-version">${escapeHtml(iface.type || 'ether')}</span></td>
        <td><span class="font-mono text-muted">${escapeHtml(iface.mac || '-')}</span></td>
        <td><span class="font-mono text-cyan">${formatBps(rxBps)}</span></td>
        <td><span class="font-mono text-purple">${formatBps(txBps)}</span></td>
        <td><span class="font-mono text-dim">${formatBytes(iface.rx_bytes)} / ${formatBytes(iface.tx_bytes)}</span></td>
        <td><span class="text-muted">${escapeHtml(iface.comment || '-')}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  // Push total bps ke Traffic Chart
  pushTrafficChartData(totalRxBps, totalTxBps);
}

function populateInterfaceSelects(interfaces) {
  // Populate filter dropdown di grafik traffic
  const trafficSelect = document.getElementById('select-traffic-interface');
  if (trafficSelect && trafficSelect.options.length <= 1) {
    interfaces.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.name;
      opt.textContent = i.name;
      trafficSelect.appendChild(opt);
    });
  }

  // Populate IP Address target interface dropdown di modal tambah & edit
  const ipSelect = document.getElementById('ip-interface-select');
  const editIpSelect = document.getElementById('edit-ip-interface');
  if (ipSelect && ipSelect.options.length === 0) {
    interfaces.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.name;
      opt.textContent = `${i.name} (${i.type || 'ether'})`;
      ipSelect.appendChild(opt);

      if (editIpSelect) {
        const optEdit = document.createElement('option');
        optEdit.value = i.name;
        optEdit.textContent = `${i.name} (${i.type || 'ether'})`;
        editIpSelect.appendChild(optEdit);
      }
    });
  }

  // Populate NAT Out-Interface dropdown di modal tambah & edit
  const natSelect = document.getElementById('nat-outiface-select');
  const editNatSelect = document.getElementById('edit-nat-outiface');
  if (natSelect && natSelect.options.length <= 1) {
    interfaces.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.name;
      opt.textContent = i.name;
      natSelect.appendChild(opt);

      if (editNatSelect) {
        const optEdit = document.createElement('option');
        optEdit.value = i.name;
        optEdit.textContent = i.name;
        editNatSelect.appendChild(optEdit);
      }
    });
  }
}

function changeTrafficInterface(ifaceName) {
  AppState.selectedTrafficInterface = ifaceName;
  triggerManualRefresh();
}

// ==================== MONITORING TAB POLLING ====================

async function pollMonitoringTab() {
  switch (AppState.currentSubTab) {
    case 'mon-traffic':
      const traffic = await API.getTraffic();
      renderMonitoringTrafficGauges(traffic.interfaces || []);
      break;
    case 'mon-resources':
      if (AppState.resourceChart) {
        AppState.resourceChart.resize();
      }
      break;
    case 'mon-connections':
      const conns = await API.getConnections(50);
      renderConnections(conns.connections || []);
      break;
    case 'mon-leases':
      const leases = await API.getDhcpLeases();
      renderDhcpLeases(leases.leases || []);
      break;
    case 'mon-logs':
      await fetchLogs();
      break;
  }
}

function renderMonitoringTrafficGauges(interfaces) {
  const container = document.getElementById('interface-gauge-grid');
  if (!container) return;

  let html = '';
  interfaces.forEach(iface => {
    const rxBps = iface.rx_bps || 0;
    const txBps = iface.tx_bps || 0;
    const isRunning = iface.running;

    html += `
      <div class="glass-card gauge-card">
        <div class="gauge-header">
          <span class="gauge-title"><i class="fa-solid fa-ethernet text-cyan"></i> ${escapeHtml(iface.name)}</span>
          <span class="badge-status ${isRunning ? 'active' : 'inactive'}">
            ${isRunning ? 'UP' : 'DOWN'}
          </span>
        </div>
        <div class="gauge-rates">
          <div class="rate-box">
            <span class="rate-label"><i class="fa-solid fa-arrow-down text-cyan"></i> Download (Rx)</span>
            <span class="rate-val text-cyan">${formatBps(rxBps)}</span>
          </div>
          <div class="rate-box tx">
            <span class="rate-label"><i class="fa-solid fa-arrow-up text-purple"></i> Upload (Tx)</span>
            <span class="rate-val text-purple">${formatBps(txBps)}</span>
          </div>
        </div>
        <div class="info-row text-dim" style="font-size:0.75rem;">
          <span>Total: ${formatBytes(iface.rx_bytes + iface.tx_bytes)}</span>
          <span>MAC: ${escapeHtml(iface.mac || '-')}</span>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderConnections(connections) {
  const tbody = document.getElementById('tbody-connections');
  if (!tbody) return;

  if (!connections || connections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Tidak ada koneksi aktif saat ini</td></tr>`;
    return;
  }

  let html = '';
  connections.forEach(c => {
    html += `
      <tr>
        <td><span class="badge-version">${escapeHtml(c.protocol || '-')}</span></td>
        <td><span class="font-mono text-cyan">${escapeHtml(c['src-address'] || '-')}</span></td>
        <td><span class="font-mono text-purple">${escapeHtml(c['dst-address'] || '-')}</span></td>
        <td><span class="badge-mode">${escapeHtml(c['tcp-state'] || 'active')}</span></td>
        <td><span class="font-mono text-dim">${escapeHtml(c.timeout || '-')}</span></td>
        <td><span class="font-mono">${formatBytes(parseInt(c['orig-bytes'] || 0, 10))}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDhcpLeases(leases) {
  const tbody = document.getElementById('tbody-dhcp-leases');
  if (!tbody) return;

  if (!leases || leases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Belum ada DHCP lease</td></tr>`;
    return;
  }

  let html = '';
  leases.forEach(l => {
    const isBound = (l.status || '').toLowerCase() === 'bound';
    const isDynamic = String(l.dynamic).toLowerCase() === 'true';

    html += `
      <tr>
        <td>
          <span class="badge-status ${isBound ? 'active' : 'inactive'}">
            ${escapeHtml(l.status || 'unknown')}
          </span>
        </td>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(l.address)}</span></td>
        <td><span class="font-mono">${escapeHtml(l['mac-address'] || '-')}</span></td>
        <td>${escapeHtml(l['host-name'] || '-')}</td>
        <td><span class="badge-version">${escapeHtml(l.server || '-')}</span></td>
        <td><span class="badge-mode">${isDynamic ? 'Dynamic' : 'Static'}</span></td>
        <td><span class="text-muted">${escapeHtml(l.comment || '-')}</span></td>
        <td class="action-cell">
          <button class="glass-btn-sm" title="Edit Lease" onclick="openEditLeaseModal('${escapeHtml(l['.id'])}', '${escapeHtml(l.address)}', '${escapeHtml(l['mac-address'] || '')}', '${escapeHtml(l.comment || '')}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="glass-btn-sm btn-danger" title="Hapus Lease" onclick="deleteDhcpLease('${escapeHtml(l['.id'])}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

async function fetchLogs() {
  try {
    const data = await API.getLogs(60);
    AppState.logsCache = data.logs || [];
    renderLogs(AppState.logsCache);
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

function renderLogs(logs) {
  const container = document.getElementById('log-stream-box');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div class="text-center text-muted p-4">Tidak ada catatan log</div>`;
    return;
  }

  let html = '';
  logs.forEach(log => {
    const topics = log.topics || 'info';
    let topicClass = '';
    if (topics.includes('warning')) topicClass = 'warning';
    if (topics.includes('error') || topics.includes('critical')) topicClass = 'error';

    html += `
      <div class="log-entry">
        <span class="log-time">[${escapeHtml(log.time || '')}]</span>
        <span class="log-topic ${topicClass}">&lt;${escapeHtml(topics)}&gt;</span>
        <span class="log-msg">${escapeHtml(log.message || '')}</span>
      </div>
    `;
  });
  container.innerHTML = html;
}

function filterLogs(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderLogs(AppState.logsCache);
    return;
  }
  const filtered = AppState.logsCache.filter(l => 
    (l.message && l.message.toLowerCase().includes(q)) ||
    (l.topics && l.topics.toLowerCase().includes(q))
  );
  renderLogs(filtered);
}

function filterTable(tableId, query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(r => {
    r.style.display = r.innerText.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ==================== CONFIGURATION TAB POLLING ====================

async function pollConfigTab() {
  switch (AppState.currentConfigTab) {
    case 'cfg-ip':
      const addrs = await API.getIpAddresses();
      renderIpAddresses(addrs.addresses || []);
      break;
    case 'cfg-iface':
      const ifaces = await API.getInterfaces();
      renderConfigInterfaces(ifaces.interfaces || []);
      break;
    case 'cfg-dhcp':
      try {
        const [srvRes, poolsRes] = await Promise.all([
          API.getDhcpServers(),
          API.getIpPools()
        ]);
        renderDhcpServers(srvRes.servers || []);
        renderIpPools(poolsRes.pools || []);
      } catch (err) {
        console.error('Error loading DHCP config:', err);
      }
      break;
    case 'cfg-dns':
      const dns = await API.getDns();
      renderDnsConfig(dns.dns || {});
      break;
    case 'cfg-firewall':
      const filters = await API.getFirewallFilters();
      const nats = await API.getFirewallNats();
      renderFirewallRules(filters.rules || [], nats.rules || []);
      break;
    case 'cfg-system':
      const idInput = document.getElementById('input-router-identity');
      if (idInput && !idInput.value) {
        const specId = document.getElementById('spec-identity');
        if (specId && specId.textContent && specId.textContent !== '-') {
          idInput.value = specId.textContent;
        }
      }
      break;
  }
}

function renderIpAddresses(addresses) {
  const tbody = document.getElementById('tbody-config-ip');
  if (!tbody) return;

  if (!addresses || addresses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada IP Address</td></tr>`;
    return;
  }

  let html = '';
  addresses.forEach(item => {
    const isDisabled = String(item.disabled).toLowerCase() === 'true';
    html += `
      <tr>
        <td>
          <span class="badge-status ${isDisabled ? 'inactive' : 'active'}">
            ${isDisabled ? 'Disabled' : 'Active'}
          </span>
        </td>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(item.address)}</span></td>
        <td><span class="font-mono text-muted">${escapeHtml(item.network || '-')}</span></td>
        <td><span class="badge-version">${escapeHtml(item.interface)}</span></td>
        <td><span class="text-muted">${escapeHtml(item.comment || '-')}</span></td>
        <td class="action-cell">
          <button class="glass-btn-sm" title="Edit IP" onclick="openEditIpModal('${escapeHtml(item['.id'])}', '${escapeHtml(item.address)}', '${escapeHtml(item.interface)}', '${escapeHtml(item.comment || '')}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="glass-btn-sm btn-danger" title="Hapus IP" onclick="deleteIpAddress('${escapeHtml(item['.id'])}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderConfigInterfaces(interfaces) {
  const tbody = document.getElementById('tbody-config-iface');
  if (!tbody) return;

  let html = '';
  interfaces.forEach(i => {
    const isDisabled = String(i.disabled).toLowerCase() === 'true';
    const isRunning = String(i.running).toLowerCase() === 'true';

    html += `
      <tr>
        <td>
          <span class="badge-status ${!isDisabled && isRunning ? 'active' : 'inactive'}">
            ${isDisabled ? 'Disabled' : (isRunning ? 'Running' : 'No Link')}
          </span>
        </td>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(i.name)}</span></td>
        <td><span class="badge-version">${escapeHtml(i.type || 'ether')}</span></td>
        <td><span class="font-mono">${escapeHtml(i['mac-address'] || '-')}</span></td>
        <td><span class="font-mono">${escapeHtml(i.mtu || '1500')}</span></td>
        <td><span class="text-muted">${escapeHtml(i.comment || '-')}</span></td>
        <td>
          <button class="glass-btn-sm ${isDisabled ? 'btn-primary' : 'btn-danger'}" onclick="toggleInterface('${escapeHtml(i['.id'])}', ${!isDisabled})">
            <i class="fa-solid fa-power-off"></i> ${isDisabled ? 'Aktifkan' : 'Nonaktifkan'}
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDhcpServers(servers) {
  const tbody = document.getElementById('tbody-config-dhcp-servers');
  if (!tbody) return;

  if (!servers || servers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada DHCP Server aktif</td></tr>`;
    return;
  }

  let html = '';
  servers.forEach(s => {
    html += `
      <tr>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(s.name || '-')}</span></td>
        <td><span class="badge-version">${escapeHtml(s.interface || '-')}</span></td>
        <td><span class="font-mono text-purple">${escapeHtml(s['address-pool'] || '-')}</span></td>
        <td><span class="font-mono text-dim">${escapeHtml(s['lease-time'] || '10m')}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderIpPools(pools) {
  const tbody = document.getElementById('tbody-config-ip-pools');
  if (!tbody) return;

  if (!pools || pools.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Belum ada IP Pool</td></tr>`;
    return;
  }

  let html = '';
  pools.forEach(p => {
    html += `
      <tr>
        <td><span class="font-mono font-bold text-cyan">${escapeHtml(p.name)}</span></td>
        <td><span class="font-mono text-purple">${escapeHtml(p.ranges)}</span></td>
        <td class="action-cell">
          <button class="glass-btn-sm" title="Edit Pool" onclick="openEditPoolModal('${escapeHtml(p['.id'])}', '${escapeHtml(p.name)}', '${escapeHtml(p.ranges)}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="glass-btn-sm btn-danger" title="Hapus Pool" onclick="deleteIpPool('${escapeHtml(p['.id'])}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDnsConfig(dns) {
  if (!dns) return;
  const serversInput = document.getElementById('dns-servers');
  if (serversInput && document.activeElement !== serversInput) {
    serversInput.value = dns.servers || '';
  }
  document.getElementById('dns-dynamic').value = dns['dynamic-servers'] || '(Tidak ada dynamic DNS)';
  document.getElementById('dns-allow-remote').checked = (dns['allow-remote-requests'] === 'yes' || dns['allow-remote-requests'] === true);
  document.getElementById('dns-cache-size').textContent = dns['cache-size'] || '-';
  document.getElementById('dns-cache-used').textContent = dns['cache-used'] || '-';
}

function renderFirewallRules(filters, nats) {
  // 1. Filter Rules
  const tbodyFilter = document.getElementById('tbody-firewall-filters');
  if (tbodyFilter) {
    if (!filters || filters.length === 0) {
      tbodyFilter.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Belum ada Filter Rules</td></tr>`;
    } else {
      let html = '';
      filters.forEach(r => {
        const actionBadge = r.action === 'accept' ? 'badge-success' : 'badge-danger';
        html += `
          <tr>
            <td><span class="badge-version">${escapeHtml(r.chain)}</span></td>
            <td><span class="${actionBadge}">${escapeHtml(r.action)}</span></td>
            <td><span class="font-mono">${escapeHtml(r.protocol || 'all')}</span></td>
            <td><span class="font-mono">${escapeHtml(r['dst-port'] || '-')}</span></td>
            <td><span class="font-mono text-dim">${formatBytes(parseInt(r.bytes || 0, 10))} / ${r.packets || 0}</span></td>
            <td><span class="text-muted">${escapeHtml(r.comment || '-')}</span></td>
            <td class="action-cell">
              <button class="glass-btn-sm" title="Edit Filter" onclick="openEditFilterModal('${escapeHtml(r['.id'])}', '${escapeHtml(r.chain)}', '${escapeHtml(r.action)}', '${escapeHtml(r.protocol || '')}', '${escapeHtml(r['dst-port'] || '')}', '${escapeHtml(r.comment || '')}')">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="glass-btn-sm btn-danger" title="Hapus Filter" onclick="deleteFirewallRule('filter', '${escapeHtml(r['.id'])}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });
      tbodyFilter.innerHTML = html;
    }
  }

  // 2. NAT Rules
  const tbodyNat = document.getElementById('tbody-firewall-nats');
  if (tbodyNat) {
    if (!nats || nats.length === 0) {
      tbodyNat.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Belum ada NAT Rules</td></tr>`;
    } else {
      let html = '';
      nats.forEach(r => {
        html += `
          <tr>
            <td><span class="badge-version">${escapeHtml(r.chain)}</span></td>
            <td><span class="badge-mode">${escapeHtml(r.action)}</span></td>
            <td><span class="font-mono text-cyan">${escapeHtml(r['out-interface'] || 'any')}</span></td>
            <td><span class="font-mono text-purple">${escapeHtml(r['to-addresses'] || '-')}</span></td>
            <td><span class="font-mono text-dim">${formatBytes(parseInt(r.bytes || 0, 10))}</span></td>
            <td><span class="text-muted">${escapeHtml(r.comment || '-')}</span></td>
            <td class="action-cell">
              <button class="glass-btn-sm" title="Edit NAT" onclick="openEditNatModal('${escapeHtml(r['.id'])}', '${escapeHtml(r.chain)}', '${escapeHtml(r.action)}', '${escapeHtml(r['out-interface'] || '')}', '${escapeHtml(r['to-addresses'] || '')}', '${escapeHtml(r.comment || '')}')">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="glass-btn-sm btn-danger" title="Hapus NAT" onclick="deleteFirewallRule('nat', '${escapeHtml(r['.id'])}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });
      tbodyNat.innerHTML = html;
    }
  }
}

// ==================== HOTSPOT TAB POLLING ====================

async function pollHotspotTab() {
  try {
    const activeData = await API.getHotspotActive();
    const usersData = await API.getHotspotUsers();

    // Render Active
    const tbodyActive = document.getElementById('tbody-hotspot-active');
    const active = activeData.active || [];
    if (active.length === 0) {
      tbodyActive.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Tidak ada user hotspot yang sedang login</td></tr>`;
    } else {
      let html = '';
      active.forEach(a => {
        html += `
          <tr>
            <td><span class="font-mono font-bold text-cyan">${escapeHtml(a.user)}</span></td>
            <td><span class="font-mono">${escapeHtml(a.address)}</span></td>
            <td><span class="font-mono text-muted">${escapeHtml(a['mac-address'] || '-')}</span></td>
            <td><span class="font-mono">${escapeHtml(a.uptime || '-')}</span></td>
            <td><span class="font-mono text-dim">${formatBytes(parseInt(a['bytes-in'] || 0, 10))} / ${formatBytes(parseInt(a['bytes-out'] || 0, 10))}</span></td>
          </tr>
        `;
      });
      tbodyActive.innerHTML = html;
    }

    // Render Users
    const tbodyUsers = document.getElementById('tbody-hotspot-users');
    const users = usersData.users || [];
    if (users.length === 0) {
      tbodyUsers.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada akun hotspot terdaftar</td></tr>`;
    } else {
      let html = '';
      users.forEach(u => {
        html += `
          <tr>
            <td><span class="font-mono font-bold text-purple">${escapeHtml(u.name)}</span></td>
            <td><span class="badge-version">${escapeHtml(u.profile || 'default')}</span></td>
            <td><span class="text-muted">${escapeHtml(u.comment || '-')}</span></td>
            <td><span class="font-mono text-dim">${formatBytes(parseInt(u['bytes-out'] || 0, 10))}</span></td>
            <td class="action-cell">
              <button class="glass-btn-sm" title="Edit User" onclick="openEditHotspotUserModal('${escapeHtml(u['.id'])}', '${escapeHtml(u.name)}', '${escapeHtml(u.profile || 'default')}', '${escapeHtml(u.comment || '')}')">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="glass-btn-sm btn-danger" title="Hapus User" onclick="deleteHotspotUser('${escapeHtml(u['.id'])}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });
      tbodyUsers.innerHTML = html;
    }
  } catch (err) {
    console.error('Hotspot poll error:', err);
  }
}

// ==================== CRUD & FORM SUBMISSION ACTIONS ====================

// --- IP Address ---
async function submitAddIp(e) {
  e.preventDefault();
  const address = document.getElementById('ip-address-input').value.trim();
  const iface = document.getElementById('ip-interface-select').value;
  const comment = document.getElementById('ip-comment-input').value.trim();

  try {
    await API.addIpAddress(address, iface, comment);
    showToast(`IP Address ${address} berhasil ditambahkan!`, 'success');
    closeModal('modal-add-ip');
    document.getElementById('form-add-ip').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menambahkan IP', 'error');
  }
}

async function deleteIpAddress(id) {
  if (!confirm('Yakin ingin menghapus IP Address ini dari MikroTik?')) return;
  try {
    await API.deleteIpAddress(id);
    showToast('IP Address berhasil dihapus', 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus IP Address', 'error');
  }
}

function openEditIpModal(id, address, iface, comment) {
  document.getElementById('edit-ip-id').value = id;
  document.getElementById('edit-ip-address').value = address;
  const ifaceSelect = document.getElementById('edit-ip-interface');
  if (ifaceSelect) ifaceSelect.value = iface;
  document.getElementById('edit-ip-comment').value = comment || '';
  openModal('modal-edit-ip');
}

async function submitEditIp(e) {
  e.preventDefault();
  const id = document.getElementById('edit-ip-id').value;
  const address = document.getElementById('edit-ip-address').value.trim();
  const iface = document.getElementById('edit-ip-interface').value;
  const comment = document.getElementById('edit-ip-comment').value.trim();

  try {
    await API.updateIpAddress(id, address, iface, comment);
    showToast(`IP Address ${address} berhasil diperbarui!`, 'success');
    closeModal('modal-edit-ip');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui IP', 'error');
  }
}

// --- Interface Toggle ---
async function toggleInterface(id, disabled) {
  const actionText = disabled ? 'menonaktifkan' : 'mengaktifkan';
  if (!confirm(`Apakah Anda yakin ingin ${actionText} interface ini?`)) return;

  try {
    await API.toggleInterface(id, disabled);
    showToast(`Interface berhasil ${disabled ? 'dinonaktifkan' : 'diaktifkan'}`, 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal mengubah status interface', 'error');
  }
}

// --- DHCP Leases ---
async function submitAddLease(e) {
  e.preventDefault();
  const address = document.getElementById('lease-ip-input').value.trim();
  const mac = document.getElementById('lease-mac-input').value.trim();
  const comment = document.getElementById('lease-comment-input').value.trim();

  try {
    await API.addDhcpLease(address, mac, comment);
    showToast(`Static DHCP Lease untuk ${address} berhasil ditambahkan!`, 'success');
    closeModal('modal-add-lease');
    document.getElementById('form-add-lease').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menambahkan DHCP lease', 'error');
  }
}

async function deleteDhcpLease(id) {
  if (!confirm('Hapus DHCP lease ini?')) return;
  try {
    await API.deleteDhcpLease(id);
    showToast('DHCP lease berhasil dihapus', 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus lease', 'error');
  }
}

function openEditLeaseModal(id, address, mac, comment) {
  document.getElementById('edit-lease-id').value = id;
  document.getElementById('edit-lease-ip').value = address;
  document.getElementById('edit-lease-mac').value = mac;
  document.getElementById('edit-lease-comment').value = comment || '';
  openModal('modal-edit-lease');
}

async function submitEditLease(e) {
  e.preventDefault();
  const id = document.getElementById('edit-lease-id').value;
  const address = document.getElementById('edit-lease-ip').value.trim();
  const mac = document.getElementById('edit-lease-mac').value.trim();
  const comment = document.getElementById('edit-lease-comment').value.trim();

  try {
    await API.updateDhcpLease(id, address, mac, comment);
    showToast(`DHCP Lease untuk ${address} berhasil diperbarui!`, 'success');
    closeModal('modal-edit-lease');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui lease', 'error');
  }
}

// --- IP Pool ---
async function submitAddPool(e) {
  e.preventDefault();
  const name = document.getElementById('pool-name-input').value.trim();
  const ranges = document.getElementById('pool-ranges-input').value.trim();

  try {
    await API.addIpPool(name, ranges);
    showToast(`IP Pool '${name}' berhasil dibuat!`, 'success');
    closeModal('modal-add-pool');
    document.getElementById('form-add-pool').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menambahkan IP pool', 'error');
  }
}

function openEditPoolModal(id, name, ranges) {
  document.getElementById('edit-pool-id').value = id;
  document.getElementById('edit-pool-name').value = name;
  document.getElementById('edit-pool-ranges').value = ranges;
  openModal('modal-edit-pool');
}

async function submitEditPool(e) {
  e.preventDefault();
  const id = document.getElementById('edit-pool-id').value;
  const name = document.getElementById('edit-pool-name').value.trim();
  const ranges = document.getElementById('edit-pool-ranges').value.trim();

  try {
    await API.updateIpPool(id, name, ranges);
    showToast(`IP Pool '${name}' berhasil diperbarui!`, 'success');
    closeModal('modal-edit-pool');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui pool', 'error');
  }
}

async function deleteIpPool(id) {
  if (!confirm('Hapus IP Pool ini?')) return;
  try {
    await API.deleteIpPool(id);
    showToast('IP Pool berhasil dihapus', 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus IP Pool', 'error');
  }
}

// --- DNS ---
async function handleUpdateDns(e) {
  e.preventDefault();
  const servers = document.getElementById('dns-servers').value.trim();
  const allowRemote = document.getElementById('dns-allow-remote').checked;

  try {
    await API.updateDns(servers, allowRemote);
    showToast('Pengaturan DNS berhasil disimpan ke MikroTik!', 'success');
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui DNS', 'error');
  }
}

// --- Firewall Rules ---
async function submitAddFilter(e) {
  e.preventDefault();
  const payload = {
    chain: document.getElementById('filter-chain-select').value,
    action: document.getElementById('filter-action-select').value,
    protocol: document.getElementById('filter-proto-select').value,
    port: document.getElementById('filter-port-input').value.trim(),
    comment: document.getElementById('filter-comment-input').value.trim()
  };

  try {
    await API.addFirewallFilter(payload);
    showToast('Filter Rule baru berhasil dibuat!', 'success');
    closeModal('modal-add-filter');
    document.getElementById('form-add-filter').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal membuat filter rule', 'error');
  }
}

async function submitAddNat(e) {
  e.preventDefault();
  const payload = {
    chain: document.getElementById('nat-chain-select').value,
    action: document.getElementById('nat-action-select').value,
    out_interface: document.getElementById('nat-outiface-select').value,
    to_addresses: document.getElementById('nat-toaddr-input').value.trim(),
    comment: document.getElementById('nat-comment-input').value.trim()
  };

  try {
    await API.addFirewallNat(payload);
    showToast('NAT Rule baru berhasil dibuat!', 'success');
    closeModal('modal-add-nat');
    document.getElementById('form-add-nat').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal membuat NAT rule', 'error');
  }
}

async function deleteFirewallRule(type, id) {
  if (!confirm(`Hapus aturan Firewall ${type.toUpperCase()} ini?`)) return;
  try {
    if (type === 'filter') {
      await API.deleteFirewallFilter(id);
    } else {
      await API.deleteFirewallNat(id);
    }
    showToast(`Rule ${type.toUpperCase()} berhasil dihapus`, 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus rule', 'error');
  }
}

function openEditFilterModal(id, chain, action, proto, port, comment) {
  document.getElementById('edit-filter-id').value = id;
  document.getElementById('edit-filter-chain').value = chain;
  document.getElementById('edit-filter-action').value = action;
  document.getElementById('edit-filter-proto').value = proto || '';
  document.getElementById('edit-filter-port').value = port || '';
  document.getElementById('edit-filter-comment').value = comment || '';
  openModal('modal-edit-filter');
}

async function submitEditFilter(e) {
  e.preventDefault();
  const id = document.getElementById('edit-filter-id').value;
  const payload = {
    chain: document.getElementById('edit-filter-chain').value,
    action: document.getElementById('edit-filter-action').value,
    protocol: document.getElementById('edit-filter-proto').value,
    port: document.getElementById('edit-filter-port').value.trim(),
    comment: document.getElementById('edit-filter-comment').value.trim()
  };

  try {
    await API.updateFirewallFilter(id, payload);
    showToast('Filter Rule berhasil diperbarui!', 'success');
    closeModal('modal-edit-filter');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui filter rule', 'error');
  }
}

function openEditNatModal(id, chain, action, outiface, toaddr, comment) {
  document.getElementById('edit-nat-id').value = id;
  document.getElementById('edit-nat-chain').value = chain;
  document.getElementById('edit-nat-action').value = action;
  const ifaceSelect = document.getElementById('edit-nat-outiface');
  if (ifaceSelect) ifaceSelect.value = outiface || '';
  document.getElementById('edit-nat-toaddr').value = toaddr || '';
  document.getElementById('edit-nat-comment').value = comment || '';
  openModal('modal-edit-nat');
}

async function submitEditNat(e) {
  e.preventDefault();
  const id = document.getElementById('edit-nat-id').value;
  const payload = {
    chain: document.getElementById('edit-nat-chain').value,
    action: document.getElementById('edit-nat-action').value,
    out_interface: document.getElementById('edit-nat-outiface').value,
    to_addresses: document.getElementById('edit-nat-toaddr').value.trim(),
    comment: document.getElementById('edit-nat-comment').value.trim()
  };

  try {
    await API.updateFirewallNat(id, payload);
    showToast('NAT Rule berhasil diperbarui!', 'success');
    closeModal('modal-edit-nat');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui NAT rule', 'error');
  }
}

// --- Hotspot User ---
async function submitAddHotspotUser(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('hs-username').value.trim(),
    password: document.getElementById('hs-password').value,
    profile: document.getElementById('hs-profile').value.trim() || 'default',
    comment: document.getElementById('hs-comment').value.trim()
  };

  try {
    await API.addHotspotUser(payload);
    showToast(`User hotspot '${payload.name}' berhasil ditambahkan!`, 'success');
    closeModal('modal-add-hotspot-user');
    document.getElementById('form-add-hotspot-user').reset();
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menambahkan user hotspot', 'error');
  }
}

function openEditHotspotUserModal(id, name, profile, comment) {
  document.getElementById('edit-hs-id').value = id;
  document.getElementById('edit-hs-username').value = name;
  document.getElementById('edit-hs-password').value = '';
  document.getElementById('edit-hs-profile').value = profile || 'default';
  document.getElementById('edit-hs-comment').value = comment || '';
  openModal('modal-edit-hotspot-user');
}

async function submitEditHotspotUser(e) {
  e.preventDefault();
  const id = document.getElementById('edit-hs-id').value;
  const payload = {
    name: document.getElementById('edit-hs-username').value.trim(),
    password: document.getElementById('edit-hs-password').value,
    profile: document.getElementById('edit-hs-profile').value.trim() || 'default',
    comment: document.getElementById('edit-hs-comment').value.trim()
  };

  try {
    await API.updateHotspotUser(id, payload);
    showToast(`User '${payload.name}' berhasil diperbarui!`, 'success');
    closeModal('modal-edit-hotspot-user');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal memperbarui user', 'error');
  }
}

async function deleteHotspotUser(id) {
  if (!confirm('Hapus akun hotspot ini?')) return;
  try {
    await API.deleteHotspotUser(id);
    showToast('User hotspot berhasil dihapus', 'success');
    triggerManualRefresh();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus user', 'error');
  }
}

// --- System: Identity & Reboot ---
async function handleUpdateIdentity(e) {
  e.preventDefault();
  const name = document.getElementById('input-router-identity').value.trim();
  if (!name) return;

  try {
    await API.setIdentity(name);
    showToast(`Identity router diubah menjadi: ${name}`, 'success');
    document.getElementById('top-identity-name').textContent = name;
    document.getElementById('spec-identity').textContent = name;
  } catch (err) {
    showToast(err.message || 'Gagal mengubah identity', 'error');
  }
}

async function confirmReboot() {
  const ans = prompt('Ketik "REBOOT" dengan huruf kapital untuk konfirmasi restart MikroTik:');
  if (ans === 'REBOOT') {
    try {
      await API.rebootRouter();
      showToast('Perintah restart telah dikirim ke router...', 'warning', 8000);
    } catch (err) {
      showToast(err.message || 'Gagal mengirim perintah restart', 'error');
    }
  }
}

// ==================== REALTIME CHARTS (CHART.JS) ====================

function initCharts() {
  if (AppState.chartsInitialized) return;
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js belum siap atau gagal dimuat');
    return;
  }

  // Konfigurasi Global Chart.js untuk Light Hologram Glass Theme
  Chart.defaults.color = '#475569';
  Chart.defaults.font.family = "'Rajdhani', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = 600;

  // 1. Traffic Chart (Dual Line: Rx vs Tx)
  const ctxTraffic = document.getElementById('trafficChart');
  if (ctxTraffic) {
    AppState.trafficChart = new Chart(ctxTraffic, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Download (Rx)',
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.14)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointRadius: 2.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#0284c7',
            data: []
          },
          {
            label: 'Upload (Tx)',
            borderColor: '#d946ef',
            backgroundColor: 'rgba(217, 70, 239, 0.14)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointRadius: 2.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#d946ef',
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { 
              boxWidth: 14, 
              usePointStyle: true, 
              color: '#1e293b',
              font: { family: "'Rajdhani', sans-serif", weight: 700, size: 12 } 
            }
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            titleColor: '#0f172a',
            bodyColor: '#334155',
            borderColor: 'rgba(2, 132, 199, 0.35)',
            borderWidth: 1,
            titleFont: { family: "'Rajdhani', sans-serif", size: 13, weight: 700 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)',
            callbacks: {
              label: (context) => ` ${context.dataset.label}: ${formatBps(context.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(2, 132, 199, 0.08)' },
            ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(2, 132, 199, 0.08)' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => formatBps(val)
            }
          }
        }
      }
    });
  }

  // 2. Resource Chart (CPU & RAM Load History)
  const ctxResource = document.getElementById('resourceChart');
  if (ctxResource) {
    AppState.resourceChart = new Chart(ctxResource, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'CPU Load (%)',
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.12)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointRadius: 2.5,
            data: []
          },
          {
            label: 'RAM Usage (%)',
            borderColor: '#ec4899',
            backgroundColor: 'rgba(236, 72, 153, 0.12)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointRadius: 2.5,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: {
            position: 'top',
            labels: { 
              boxWidth: 14, 
              usePointStyle: true, 
              color: '#1e293b',
              font: { family: "'Rajdhani', sans-serif", weight: 700, size: 12 } 
            }
          }
        },
        scales: {
          x: { 
            grid: { color: 'rgba(2, 132, 199, 0.08)' },
            ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(2, 132, 199, 0.08)' },
            ticks: { 
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => `${val}%` 
            }
          }
        }
      }
    });
  }

  AppState.chartsInitialized = true;
}

function pushTrafficChartData(rxBps, txBps) {
  if (!AppState.trafficChart) return;

  const now = new Date();
  const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const chart = AppState.trafficChart;
  chart.data.labels.push(timeLabel);
  chart.data.datasets[0].data.push(rxBps);
  chart.data.datasets[1].data.push(txBps);

  if (chart.data.labels.length > AppState.chartHistoryLength) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
  }

  chart.update('none'); // Update halus tanpa redraw animasi penuh
}

function pushResourceChartData(cpuLoad, ramPercent) {
  if (!AppState.resourceChart) return;

  const now = new Date();
  const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const chart = AppState.resourceChart;
  chart.data.labels.push(timeLabel);
  chart.data.datasets[0].data.push(cpuLoad);
  chart.data.datasets[1].data.push(ramPercent);

  if (chart.data.labels.length > 30) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
  }

  chart.update('none');
}

// ==================== MODAL HELPERS ====================

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// ==================== TOAST NOTIFICATION SYSTEM ====================

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-bell';

  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div style="flex:1;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== UTILITY FORMATTERS ====================

function formatBytes(bytes) {
  const b = parseInt(bytes, 10);
  if (isNaN(b) || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatBps(bps) {
  const val = parseFloat(bps);
  if (isNaN(val) || val <= 0) return '0 bps';
  if (val >= 1000000000) return `${(val / 1000000000).toFixed(2)} Gbps`;
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)} Mbps`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)} Kbps`;
  return `${Math.round(val)} bps`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
