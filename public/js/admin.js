// Admin portal — super-admin only

const themeStorageKey = 'consulting-services-theme';

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(themeStorageKey, theme);
  document.getElementById('lightThemeBtn').classList.toggle('active', theme === 'light');
  document.getElementById('darkThemeBtn').classList.toggle('active', theme === 'dark');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2400);
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[c]);
}

function dateLabel(value) {
  if (!value) return 'Not set';
  const parts = (value || '').substring(0, 10).split('-').map(Number);
  if (parts.length < 3 || !parts[0]) return 'Not set';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

let agencies = [], logs = [], allRecords = [], allUsers = [];
let currentLogFilter = '';

function renderAgenciesTable(tbodyId, emptyId) {
  const tbody   = document.getElementById(tbodyId);
  const emptyEl = document.getElementById(emptyId);
  tbody.innerHTML = '';
  emptyEl.style.display = agencies.length ? 'none' : 'block';
  agencies.forEach(a => {
    const badge = a.status === 'Active' ? 'badge completed' : 'badge rejected';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong><span class="subtext">ID: ${a.id}</span></td>
      <td><strong>${escapeHtml(a.ownerName)}</strong><span class="subtext">${escapeHtml(a.ownerEmail)}</span></td>
      <td><span class="${badge}">${a.status}</span></td>
      <td>${a.employeeCount || 0}</td>
      <td>${a.clientCount || 0}</td>
      <td>${dateLabel((a.createdAt || '').substring(0, 10))}</td>
      <td>
        <div class="row-actions">
          <button class="btn ghost" style="padding:4px 8px;min-height:28px;" type="button" data-action="toggle-agency" data-id="${a.id}">
            ${a.status === 'Active' ? 'Suspend' : 'Activate'}
          </button>
          <button class="btn ghost" style="padding:4px 8px;min-height:28px;color:var(--danger);" type="button" data-action="delete-agency" data-id="${a.id}">Delete</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderOverview() {
  const today = new Date();
  document.getElementById('totalAgencies').textContent     = agencies.length;
  document.getElementById('activeAgencies').textContent    = agencies.filter(a => a.status === 'Active').length;
  document.getElementById('suspendedAgencies').textContent = agencies.filter(a => a.status === 'Suspended').length;
  document.getElementById('totalClients').textContent      = allRecords.length;
  document.getElementById('totalEmployees').textContent    = allUsers.filter(u => u.role !== 'super-admin').length;
  document.getElementById('saasRevenue').textContent       = money(agencies.filter(a => a.status === 'Active').length * 4999);
  document.getElementById('logsToday').textContent         = logs.filter(l => new Date(l.createdAt).toDateString() === today.toDateString()).length;
  renderAgenciesTable('overviewAgenciesTable', 'overviewEmpty');
}

function renderLogs() {
  const tbody   = document.getElementById('logsTable');
  const emptyEl = document.getElementById('logsEmpty');
  tbody.innerHTML = '';
  emptyEl.style.display = logs.length ? 'none' : 'block';
  logs.forEach(log => {
    const ts = new Date(log.createdAt || log.timestamp);
    const formatted = ts.toLocaleDateString('en-IN') + ' ' + ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let cls = 'log-update';
    if (log.action.includes('CREATE')) cls = 'log-create';
    if (log.action.includes('DELETE')) cls = 'log-delete';
    if (log.action.includes('IMPORT')) cls = 'log-bulk';
    if (log.action.includes('EXPORT')) cls = 'log-export';
    if (log.action.includes('USER'))   cls = 'log-user';
    if (log.action.includes('AGENCY')) cls = 'log-agency';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap;">${formatted}</td>
      <td><strong>${escapeHtml(log.userName)}</strong><br><span class="subtext">${log.userRole.replace(/-/g,' ')}</span></td>
      <td>${escapeHtml(log.agencyName || 'Platform')}</td>
      <td><span class="badge ${cls}">${log.action.replace('CLIENT_','').replace('USER_','').replace('AGENCY_','')}</span></td>
      <td>${escapeHtml(log.details)}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadLogsAndRender() {
  try {
    const params = currentLogFilter ? { action: currentLogFilter } : {};
    const data   = await API.logs.list(params);
    logs         = data.logs;
    renderLogs();
  } catch (err) { showToast('Error loading logs: ' + err.message); }
}

// Nav tabs
let currentTab = 'overview';
document.getElementById('adminNav').querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('#adminNav [data-nav]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.nav;

    document.getElementById('overviewSection').classList.toggle('d-none',  currentTab !== 'overview');
    document.getElementById('agenciesSection').classList.toggle('d-none',  currentTab !== 'agencies');
    document.getElementById('logsSection').classList.toggle('d-none',      currentTab !== 'logs');
    document.getElementById('addAgencyBtn').classList.toggle('d-none',     currentTab !== 'agencies');

    const titleEl = document.getElementById('topbarTitle');
    const subEl   = document.getElementById('topbarSubtitle');
    if (currentTab === 'overview') {
      titleEl.textContent = 'SaaS Platform Overview'; subEl.textContent = 'Global statistics across all agencies.';
    } else if (currentTab === 'agencies') {
      titleEl.textContent = 'Agency Management'; subEl.textContent = 'Create, configure, and manage consulting agencies.';
      renderAgenciesTable('agenciesTable', 'agenciesEmpty');
    } else if (currentTab === 'logs') {
      titleEl.textContent = 'Global Audit Logs'; subEl.textContent = 'System-wide activity log.';
      await loadLogsAndRender();
    }
  });
});

// Agency actions delegation
['overviewAgenciesTable','agenciesTable'].forEach(id => {
  document.getElementById(id).addEventListener('click', async e => {
    const toggleBtn = e.target.closest('[data-action="toggle-agency"]');
    const deleteBtn = e.target.closest('[data-action="delete-agency"]');
    if (toggleBtn) {
      const agencyId = Number(toggleBtn.dataset.id);
      try {
        const res = await API.agencies.toggleStatus(agencyId);
        const idx = agencies.findIndex(a => a.id === res.agency.id);
        if (idx >= 0) agencies[idx] = { ...agencies[idx], status: res.agency.status };
        renderOverview();
        if (currentTab === 'agencies') renderAgenciesTable('agenciesTable', 'agenciesEmpty');
        showToast(`Agency ${res.agency.status === 'Active' ? 'activated' : 'suspended'}.`);
      } catch (err) { showToast('Error: ' + err.message); }
    }
    if (deleteBtn) {
      const agencyId = Number(deleteBtn.dataset.id);
      const agency   = agencies.find(a => a.id === agencyId);
      if (!agency || !confirm(`Delete agency "${agency.name}"? This will delete all their records and employees.`)) return;
      try {
        await API.agencies.remove(agencyId);
        agencies = agencies.filter(a => a.id !== agencyId);
        renderOverview();
        if (currentTab === 'agencies') renderAgenciesTable('agenciesTable', 'agenciesEmpty');
        showToast('Agency deleted.');
      } catch (err) { showToast('Error: ' + err.message); }
    }
  });
});

// Add agency form
function openAddAgencyModal() { document.getElementById('agencyForm').reset(); openModal('agencyModal'); }
document.getElementById('addAgencyBtn').addEventListener('click', openAddAgencyModal);
document.getElementById('addAgencyBtn2').addEventListener('click', openAddAgencyModal);
document.getElementById('closeAgencyModalBtn').addEventListener('click',  () => closeModal('agencyModal'));
document.getElementById('cancelAgencyModalBtn').addEventListener('click', () => closeModal('agencyModal'));

document.getElementById('agencyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await API.agencies.create({
      name:          document.getElementById('newAgencyName').value.trim(),
      ownerName:     document.getElementById('newOwnerName').value.trim(),
      ownerEmail:    document.getElementById('newOwnerEmail').value.trim(),
      ownerPassword: document.getElementById('newOwnerPassword').value,
    });
    agencies.unshift({ ...res.agency, employeeCount: 1, clientCount: 0 });
    renderOverview();
    if (currentTab === 'agencies') renderAgenciesTable('agenciesTable', 'agenciesEmpty');
    closeModal('agencyModal');
    document.getElementById('agencyForm').reset();
    showToast(`Agency "${res.agency.name}" created.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// Logs filter
document.getElementById('logActionFilter').addEventListener('change', e => {
  currentLogFilter = e.target.value;
  loadLogsAndRender();
});

document.getElementById('clearLogsBtn').addEventListener('click', async () => {
  if (!confirm('Clear ALL audit logs? This is permanent.')) return;
  try {
    await API.logs.clear();
    logs = [];
    renderLogs();
    renderOverview();
    showToast('All audit logs cleared.');
  } catch (err) { showToast('Error: ' + err.message); }
});

// Theme & logout
document.getElementById('lightThemeBtn').addEventListener('click', () => setTheme('light'));
document.getElementById('darkThemeBtn').addEventListener('click',  () => setTheme('dark'));
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await API.auth.logout();
  window.location.href = '/login';
});

// Init
async function init() {
  setTheme(localStorage.getItem(themeStorageKey) || 'light');
  try {
    const { user } = await API.auth.me();
    if (user.role !== 'super-admin') {
      window.location.href = '/dashboard';
      return;
    }
    document.getElementById('adminName').textContent   = user.name;
    document.getElementById('adminAvatar').textContent = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  } catch {
    window.location.href = '/login';
    return;
  }

  try {
    const [agData, recData, empData, logData] = await Promise.all([
      API.agencies.list(),
      API.records.list(),
      API.employees.list(),
      API.logs.list(),
    ]);
    agencies   = agData.agencies;
    allRecords = recData.records;
    allUsers   = empData.users;
    logs       = logData.logs;
    renderOverview();
  } catch (err) { showToast('Error loading data: ' + err.message); }
}

init();
