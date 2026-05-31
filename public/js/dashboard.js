// Dashboard — adapted from the original single-file app
// Storage-related code replaced with API calls; audit logging is server-side.

const themeStorageKey = 'consulting-services-theme';

const recordsTable  = document.getElementById('recordsTable');
const mobileCards   = document.getElementById('mobileCards');
const emptyState    = document.getElementById('emptyState');
const form          = document.getElementById('recordForm');
let activeSpecialFilter = '';

const fields = {
  id:                 document.getElementById('recordId'),
  clientName:         document.getElementById('clientName'),
  phone:              document.getElementById('phone'),
  dob:                document.getElementById('dob'),
  referredBy:         document.getElementById('referredBy'),
  service:            document.getElementById('service'),
  status:             document.getElementById('status'),
  appointmentDate:    document.getElementById('appointmentDate'),
  appointmentTime:    document.getElementById('appointmentTime'),
  appointmentCenter:  document.getElementById('appointmentCenter'),
  passportExpiryDate: document.getElementById('passportExpiryDate'),
  travelDate:         document.getElementById('travelDate'),
  stage:              document.getElementById('stage'),
  assignedTo:         document.getElementById('assignedTo'),
  amount:             document.getElementById('amount'),
  received:           document.getElementById('received'),
  paymentStatus:      document.getElementById('paymentStatus'),
  documentId:         document.getElementById('documentId'),
  commissionAgent:    document.getElementById('commissionAgent'),
  commissionAmount:   document.getElementById('commissionAmount'),
  commissionPaid:     document.getElementById('commissionPaid'),
  notes:              document.getElementById('notes'),
};

const today = new Date();

// ---- Service fee defaults (auto-fill when service changes) ----
const SERVICE_FEES = {
  'Passport':             2500,
  'Visa':                 7500,
  'PAN Card':              600,
  'Aadhaar Update':        350,
  'Travel Insurance':     1200,
  'Document Attestation': 1800,
  'Other Consulting':      500,
};

// ---- Document checklist per service for WhatsApp reminders ----
const SERVICE_DOCS = {
  'Passport':             ['Original Aadhaar Card', 'Birth Certificate / 10th Marksheet', 'Address Proof', '2 Passport Size Photos', 'Application Form (signed)'],
  'Visa':                 ['Valid Passport (valid 6+ months)', 'Bank Statement (3-6 months)', 'Employment Letter', 'Hotel & Flight Booking', '2 Passport Size Photos'],
  'PAN Card':             ['Aadhaar Card', 'Address Proof', 'DOB Proof', '2 Passport Size Photos', 'Application Form'],
  'Aadhaar Update':       ['Original Aadhaar', 'Supporting Document for Update', 'Active Mobile Number'],
  'Travel Insurance':     ['Passport Copy', 'Travel Dates & Destination', 'Trip Details'],
  'Document Attestation': ['Original Document', 'Photocopy', 'ID Proof'],
  'Other Consulting':     ['Relevant documents as advised'],
};

// ---- Processing stages ----
const STAGES = [
  'Documents Collected',
  'Application Submitted',
  'Under Verification',
  'Police Verification Pending',
  'Police Verification Done',
  'Approved / Visa Granted',
  'Dispatched',
  'Delivered / Ready for Pickup',
];

// Pure utilities (unchanged from original)
function pad(n) { return String(n).padStart(2, '0'); }

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateLabel(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function todayAtMidnight() { return new Date(today.getFullYear(), today.getMonth(), today.getDate()); }

function daysUntil(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  return Math.round((date - todayAtMidnight()) / 86400000);
}

function isBirthdayToday(record) {
  const date = parseLocalDate(record.dob);
  return date && date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
}

function renewalReminderDays(record) {
  const days = daysUntil(record.passportExpiryDate);
  return days === 60 || days === 30 ? days : null;
}

function statusClass(value) {
  return String(value || '').toLowerCase().replace(' client', '').replace(' received', '').replace(/\s+/g, '-');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[c]);
}

function fmtTime(value) {
  if (!value) return '';
  try {
    return new Date(`1970-01-01T${value}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return value; }
}

// WhatsApp helpers
function waPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1);
  return digits;
}

function waUrl(phone, message) {
  return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(message)}`;
}

function birthdayWaUrl(record) {
  const agencyName = currentAgency ? currentAgency.name : 'our agency';
  const msg =
`Hi ${record.clientName}! 🎂

Wishing you a very Happy Birthday from all of us at ${agencyName}!

We hope this year brings you great health, happiness, and success. Thank you for trusting us with your document services.

Warm regards,
${agencyName} Team`;
  return waUrl(record.phone, msg);
}

function renewalWaUrl(record, days) {
  const agencyName = currentAgency ? currentAgency.name : 'our agency';
  const expiryDate = dateLabel(record.passportExpiryDate);
  const msg =
`Hi ${record.clientName},

This is a reminder from ${agencyName} — your passport is expiring in *${days} days* (on ${expiryDate}).

${days === 30
  ? 'Please reach out to us at your earliest convenience to begin the renewal process. Early renewal helps avoid last-minute delays.'
  : 'Now is the perfect time to start the renewal process and avoid any travel disruptions.'}

Reply to this message or call us to get started!

Regards,
${agencyName} Team`;
  return waUrl(record.phone, msg);
}

function appointmentWaUrl(record) {
  const agencyName = currentAgency ? currentAgency.name : 'our agency';
  const docs = (SERVICE_DOCS[record.service] || SERVICE_DOCS['Other Consulting']).map(d => `• ${d}`).join('\n');
  const timeStr = record.appointmentTime
    ? new Date(`1970-01-01T${record.appointmentTime}`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '';
  const msg =
`Hi ${record.clientName},

This is a reminder from *${agencyName}* regarding your upcoming *${record.service}* appointment.

📅 Date: ${dateLabel(record.appointmentDate)}${timeStr ? `\n⏰ Time: ${timeStr}` : ''}${record.appointmentCenter ? `\n📍 Center: ${record.appointmentCenter}` : ''}

📋 Please bring the following documents:
${docs}

Please arrive 15 minutes before your appointment time.

For any queries, feel free to contact us.

Regards,
${agencyName} Team`;
  return waUrl(record.phone, msg);
}

function paymentDueWaUrl(record) {
  const agencyName = currentAgency ? currentAgency.name : 'our agency';
  const due = Number(record.amount || 0) - Number(record.received || 0);
  const msg =
`Hi ${record.clientName},

This is a friendly reminder from *${agencyName}* regarding an outstanding payment for your *${record.service}* service.

💰 Total Fees: ${money(record.amount)}
✅ Amount Paid: ${money(record.received)}
⚠️ Balance Due: *${money(due)}*

Please settle the outstanding amount at your earliest convenience.

Thank you for trusting us!

Regards,
${agencyName} Team`;
  return waUrl(record.phone, msg);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2400);
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(themeStorageKey, theme);
  document.getElementById('lightThemeBtn').classList.toggle('active', theme === 'light');
  document.getElementById('darkThemeBtn').classList.toggle('active', theme === 'dark');
}

function scrollToSection(id) {
  const el = document.querySelector(`[data-section="${id}"]`) || document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// App state
let currentUser    = null;
let currentAgency  = null;
let records   = [];
let agencies  = [];
let users     = [];
let auditLogs = [];
let currentTab = 'dashboard';
let currentLogFilter = '';

// ---- Rendering ----

function renderCurrentUserDisplay() {
  const nameEl   = document.getElementById('sessionName');
  const roleEl   = document.getElementById('sessionRole');
  const avatarEl = document.getElementById('sessionAvatar');
  nameEl.textContent   = currentUser.name;
  roleEl.textContent   = currentUser.role.replace(/-/g, ' ');
  avatarEl.textContent = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function renderNavigation() {
  const nav = document.getElementById('sidebarNav');
  let html = '';
  if (currentUser.role === 'super-admin') {
    html = `
      <button class="active" type="button" data-nav="dashboard"><span>Dashboard</span><span>01</span></button>
      <button type="button" data-nav="agencies"><span>Agencies</span><span>02</span></button>
      <button type="button" data-nav="logs"><span>Audit Logs</span><span>03</span></button>
    `;
  } else if (currentUser.role === 'agency-owner') {
    html = `
      <button class="active" type="button" data-nav="dashboard"><span>Dashboard</span><span>01</span></button>
      <button type="button" data-nav="applications"><span>Applications</span><span>02</span></button>
      <button type="button" data-nav="employees"><span>Employees</span><span>03</span></button>
      <button type="button" data-nav="logs"><span>Audit Logs</span><span>04</span></button>
    `;
  } else {
    html = `
      <button class="active" type="button" data-nav="dashboard"><span>Dashboard</span><span>01</span></button>
      <button type="button" data-nav="applications"><span>Applications</span><span>02</span></button>
    `;
  }
  nav.innerHTML = html;
  nav.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      nav.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchTab(btn.dataset.nav);
    });
  });
}

function populateFormDropdowns() {
  const assignedSel = fields.assignedTo;
  const empFilterSel = document.getElementById('employeeFilter');
  assignedSel.innerHTML = '';
  empFilterSel.innerHTML = '<option value="">All employees</option>';
  if (currentUser.role === 'super-admin') return;
  const agencyUsers = users.filter(u => u.agencyId === currentUser.agencyId);
  agencyUsers.forEach(u => {
    const o1 = document.createElement('option');
    o1.value = u.id; o1.textContent = u.name;
    assignedSel.appendChild(o1);
    const o2 = document.createElement('option');
    o2.value = u.id; o2.textContent = u.name;
    empFilterSel.appendChild(o2);
  });
  // Default assignedTo to current user
  if (assignedSel.querySelector(`option[value="${currentUser.id}"]`)) {
    assignedSel.value = currentUser.id;
  }
}

function getUserName(userId) {
  const u = users.find(u => u.id === Number(userId) || u.id === userId);
  return u ? u.name : (userId || 'Unassigned');
}

function getFilteredRecords() {
  const search        = document.getElementById('search').value.trim().toLowerCase();
  const statusFilter  = document.getElementById('statusFilter').value;
  const paymentFilter = document.getElementById('paymentFilter').value;
  const employeeFilter = document.getElementById('employeeFilter').value;

  return records.filter(record => {
    const searchable = [record.clientName, record.phone, record.service, record.documentId, record.referredBy, record.id].join(' ').toLowerCase();
    const matchesSpecial = !activeSpecialFilter
      || (activeSpecialFilter === 'due'      && Number(record.amount || 0) > Number(record.received || 0))
      || (activeSpecialFilter === 'birthdays'&& isBirthdayToday(record))
      || (activeSpecialFilter === 'renewals' && renewalReminderDays(record));
    return matchesSpecial
      && (!search        || searchable.includes(search))
      && (!statusFilter  || record.status === statusFilter)
      && (!paymentFilter || record.paymentStatus === paymentFilter)
      && (!employeeFilter|| String(record.assignedTo) === String(employeeFilter));
  });
}

function renderSummary() {
  const spanLabels = document.querySelectorAll('.summary .metric span');
  if (currentUser.role === 'super-admin') {
    spanLabels[0].textContent = 'Total Agencies';
    spanLabels[1].textContent = 'Active Agencies';
    spanLabels[2].textContent = 'Total Employees';
    spanLabels[3].textContent = 'Global Clients';
    spanLabels[4].textContent = 'Est. SaaS Revenue';
    spanLabels[5].textContent = 'Audit Logs Today';
    spanLabels[6].textContent = 'Suspended Agencies';
    const active    = agencies.filter(a => a.status === 'Active');
    const suspended = agencies.filter(a => a.status === 'Suspended');
    const emps      = users.filter(u => u.role === 'employee');
    const logsToday = auditLogs.filter(l => new Date(l.createdAt).toDateString() === today.toDateString()).length;
    document.getElementById('totalCount').textContent      = agencies.length;
    document.getElementById('processingCount').textContent = active.length;
    document.getElementById('completedCount').textContent  = emps.length;
    document.getElementById('dueAmount').textContent       = records.length;
    document.getElementById('receivedAmount').textContent  = money(active.length * 4999);
    document.getElementById('birthdayCount').textContent   = logsToday;
    document.getElementById('renewalCount').textContent    = suspended.length;
  } else {
    spanLabels[0].textContent = 'Total records';
    spanLabels[1].textContent = 'Processing';
    spanLabels[2].textContent = 'Completed';
    spanLabels[3].textContent = 'Amount due';
    spanLabels[4].textContent = 'Received';
    spanLabels[5].textContent = 'Birthdays today';
    spanLabels[6].textContent = 'Passport reminders';
    const totalReceived = records.reduce((s, r) => s + Number(r.received || 0), 0);
    const totalAmount   = records.reduce((s, r) => s + Number(r.amount   || 0), 0);
    document.getElementById('totalCount').textContent      = records.length;
    document.getElementById('processingCount').textContent = records.filter(r => r.status === 'Processing').length;
    document.getElementById('completedCount').textContent  = records.filter(r => r.status === 'Completed').length;
    document.getElementById('dueAmount').textContent       = money(totalAmount - totalReceived);
    document.getElementById('receivedAmount').textContent  = money(totalReceived);
    document.getElementById('birthdayCount').textContent   = records.filter(isBirthdayToday).length;
    document.getElementById('renewalCount').textContent    = records.filter(r => renewalReminderDays(r)).length;
  }
}

const WA_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

function renderInsights() {
  const birthdaysList = document.getElementById('birthdaysList');
  const renewalsList  = document.getElementById('renewalsList');
  const birthdays = records.filter(isBirthdayToday);
  const renewals  = records.map(r => ({ ...r, reminderDays: renewalReminderDays(r) })).filter(r => r.reminderDays).sort((a, b) => a.reminderDays - b.reminderDays);

  birthdaysList.innerHTML = birthdays.length
    ? birthdays.map(r => `
        <div class="insight-item">
          <button class="insight-edit-btn" type="button" data-action="edit" data-id="${r.id}">
            <strong>${escapeHtml(r.clientName)}</strong>
            <span class="subtext">${escapeHtml(r.phone)} · ${escapeHtml(r.service)}</span>
          </button>
          <div class="insight-badges">
            <span class="badge received">${dateLabel(r.dob).replace(/ \d{4}$/, '')}</span>
            <a class="btn-wa" href="${escapeHtml(birthdayWaUrl(r))}" target="_blank" rel="noopener" title="Send WhatsApp birthday greeting to ${escapeHtml(r.clientName)}">${WA_ICON}</a>
          </div>
        </div>`).join('')
    : '<div class="insight-empty">No client birthdays today.</div>';

  renewalsList.innerHTML = renewals.length
    ? renewals.map(r => `
        <div class="insight-item">
          <button class="insight-edit-btn" type="button" data-action="edit" data-id="${r.id}">
            <strong>${escapeHtml(r.clientName)}</strong>
            <span class="subtext">${escapeHtml(r.phone)} · Expires ${dateLabel(r.passportExpiryDate)}</span>
          </button>
          <div class="insight-badges">
            <span class="badge ${r.reminderDays === 30 ? 'pending' : 'partial'}">${r.reminderDays} days</span>
            <a class="btn-wa" href="${escapeHtml(renewalWaUrl(r, r.reminderDays))}" target="_blank" rel="noopener" title="Send WhatsApp passport expiry reminder to ${escapeHtml(r.clientName)}">${WA_ICON}</a>
          </div>
        </div>`).join('')
    : '<div class="insight-empty">No 60-day or 30-day passport expiry reminders today.</div>';
}

function renderOutstandingDues() {
  const section  = document.getElementById('outstandingDuesSection');
  const list     = document.getElementById('duesList');
  const totalEl  = document.getElementById('duesTotal');
  const dueRecs  = records
    .filter(r => Number(r.amount || 0) > Number(r.received || 0) && !['Completed','Rejected','Lost Client'].includes(r.status))
    .map(r => ({ ...r, due: Number(r.amount) - Number(r.received) }))
    .sort((a, b) => b.due - a.due);

  if (!dueRecs.length) { section.classList.add('d-none'); return; }
  section.classList.remove('d-none');

  const grandTotal = dueRecs.reduce((s, r) => s + r.due, 0);
  totalEl.textContent = `${dueRecs.length} clients · Total: ${money(grandTotal)}`;

  list.innerHTML = dueRecs.map(r => `
    <div class="insight-item">
      <button class="insight-edit-btn" type="button" data-action="edit" data-id="${r.id}">
        <strong>${escapeHtml(r.clientName)}</strong>
        <span class="subtext">${escapeHtml(r.phone)} · ${escapeHtml(r.service)}</span>
      </button>
      <div class="insight-badges">
        <span class="badge pending">${money(r.due)} due</span>
        <a class="btn-wa" href="${escapeHtml(paymentDueWaUrl(r))}" target="_blank" rel="noopener" title="Send WhatsApp payment reminder">${WA_ICON}</a>
      </div>
    </div>`).join('');
}

function renderRecords() {
  const filtered = getFilteredRecords();
  recordsTable.innerHTML = '';
  mobileCards.innerHTML  = '';
  emptyState.style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(record => {
    const name = record.assignedToName || getUserName(record.assignedTo);
    const row = document.createElement('tr');
    row.dataset.action = 'edit'; row.dataset.id = record.id;
    const stageHtml = record.stage ? `<br><span class="subtext stage-pill">${escapeHtml(record.stage)}</span>` : '';
    const apptHtml  = record.appointmentDate
      ? `${dateLabel(record.appointmentDate)}${record.appointmentTime ? ' ' + fmtTime(record.appointmentTime) : ''}${record.appointmentCenter ? `<br><span class="subtext">${escapeHtml(record.appointmentCenter)}</span>` : ''}`
      : 'Not set';
    row.innerHTML = `
      <td><strong>${escapeHtml(record.clientName)}</strong><span class="subtext">${escapeHtml(record.phone)} · ${escapeHtml(record.id)}</span></td>
      <td>${escapeHtml(record.service)}<br><span class="subtext">${escapeHtml(record.documentId || 'No reference')}</span>${stageHtml}</td>
      <td><span class="badge ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
      <td>${apptHtml}</td>
      <td>${dateLabel(record.passportExpiryDate)}<br><span class="subtext">${renewalReminderDays(record) ? `${renewalReminderDays(record)} days reminder` : 'No reminder today'}</span></td>
      <td><strong>${money(record.received)} / ${money(record.amount)}</strong><span class="badge ${statusClass(record.paymentStatus)}">${escapeHtml(record.paymentStatus)}</span></td>
      <td>${escapeHtml(record.referredBy || 'Not set')}</td>
      <td>${escapeHtml(name)}</td>
      <td>
        <div class="row-actions">
          ${record.appointmentDate ? `<a class="btn-wa-sm" href="${escapeHtml(appointmentWaUrl(record))}" target="_blank" rel="noopener" title="WhatsApp appointment reminder">${WA_ICON}</a>` : ''}
          <button class="icon-btn" type="button" title="Edit" data-action="edit" data-id="${record.id}">E</button>
          <button class="icon-btn" type="button" title="Delete" data-action="delete" data-id="${record.id}">D</button>
        </div>
      </td>`;
    recordsTable.appendChild(row);

    const card = document.createElement('article');
    card.className = 'client-card';
    card.innerHTML = `
      <div class="card-title">
        <div><strong>${escapeHtml(record.clientName)}</strong><div class="subtext">${escapeHtml(record.phone)} · ${escapeHtml(record.id)}</div></div>
        <span class="badge ${statusClass(record.status)}">${escapeHtml(record.status)}</span>
      </div>
      <div class="card-grid">
        <div><span>Service</span>${escapeHtml(record.service)}</div>
        <div><span>Stage</span>${escapeHtml(record.stage || 'Not started')}</div>
        <div><span>Appointment</span>${dateLabel(record.appointmentDate)}${record.appointmentTime ? ' ' + fmtTime(record.appointmentTime) : ''}</div>
        <div><span>Center</span>${escapeHtml(record.appointmentCenter || 'Not set')}</div>
        <div><span>Passport expiry</span>${dateLabel(record.passportExpiryDate)}</div>
        ${record.travelDate ? `<div><span>Travel date</span>${dateLabel(record.travelDate)}</div>` : ''}
        <div><span>Referred by</span>${escapeHtml(record.referredBy || 'Not set')}</div>
        <div><span>Payment</span>${money(record.received)} / ${money(record.amount)}</div>
        <div><span>Payment status</span><span class="badge ${statusClass(record.paymentStatus)}">${escapeHtml(record.paymentStatus)}</span></div>
        <div><span>Owner</span>${escapeHtml(name)}</div>
        <div><span>Reference</span>${escapeHtml(record.documentId || 'No reference')}</div>
      </div>
      <div class="row-actions">
        ${record.appointmentDate ? `<a class="btn-wa" href="${escapeHtml(appointmentWaUrl(record))}" target="_blank" rel="noopener" title="WhatsApp appointment reminder">${WA_ICON}</a>` : ''}
        <button class="btn ghost" type="button" data-action="edit" data-id="${record.id}">Edit</button>
        <button class="btn ghost" type="button" data-action="delete" data-id="${record.id}">Delete</button>
      </div>`;
    mobileCards.appendChild(card);
  });

  renderSummary();
  if (currentUser.role !== 'super-admin') {
    renderInsights();
    renderOutstandingDues();
  }
}

function renderAgencies() {
  const tbody   = document.getElementById('agenciesTable');
  const emptyEl = document.getElementById('agenciesEmptyState');
  tbody.innerHTML = '';
  emptyEl.style.display = agencies.length ? 'none' : 'block';
  agencies.forEach(a => {
    const badge = a.status === 'Active' ? 'badge completed' : 'badge rejected';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong><span class="subtext">ID: ${a.id}</span></td>
      <td><strong>${escapeHtml(a.ownerName)}</strong><span class="subtext">${escapeHtml(a.ownerEmail)}</span></td>
      <td><span class="${badge}">${a.status}</span></td>
      <td>${a.employeeCount || 0} employees</td>
      <td>${a.clientCount || 0} clients</td>
      <td>${dateLabel((a.createdAt || '').substring(0, 10))}</td>
      <td>
        <div class="row-actions">
          <button class="btn ghost" style="padding:4px 8px;min-height:28px;" type="button" data-action="toggle-agency" data-id="${a.id}">
            ${a.status === 'Active' ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderEmployees() {
  const tbody   = document.getElementById('employeesTable');
  const emptyEl = document.getElementById('employeesEmptyState');
  tbody.innerHTML = '';
  const agencyUsers = users.filter(u => u.agencyId === currentUser.agencyId);
  emptyEl.style.display = agencyUsers.length ? 'none' : 'block';
  agencyUsers.forEach(u => {
    const badge = u.status === 'Active' ? 'badge completed' : 'badge rejected';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge ${u.role === 'agency-owner' ? 'received' : 'partial'}">${u.role.replace(/-/g, ' ')}</span></td>
      <td><span class="${badge}">${u.status}</span></td>
      <td>${dateLabel((u.createdAt || '').substring(0, 10))}</td>
      <td>
        <div class="row-actions">
          ${u.id !== currentUser.id
            ? `<button class="btn ghost" style="padding:4px 8px;min-height:28px;color:var(--danger);" type="button" data-action="delete-employee" data-id="${u.id}">Delete</button>`
            : '<span class="subtext">Active User</span>'}
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

function renderAuditLogs() {
  const tbody   = document.getElementById('auditLogsTable');
  const emptyEl = document.getElementById('auditLogsEmptyState');
  tbody.innerHTML = '';
  emptyEl.style.display = auditLogs.length ? 'none' : 'block';
  auditLogs.forEach(log => {
    const ts = new Date(log.createdAt || log.timestamp);
    const formatted = ts.toLocaleDateString('en-IN') + ' ' + ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let actionClass = 'log-update';
    if (log.action.includes('CREATE')) actionClass = 'log-create';
    if (log.action.includes('DELETE')) actionClass = 'log-delete';
    if (log.action.includes('IMPORT')) actionClass = 'log-bulk';
    if (log.action.includes('EXPORT')) actionClass = 'log-export';
    if (log.action.includes('USER'))   actionClass = 'log-user';
    if (log.action.includes('AGENCY')) actionClass = 'log-agency';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap;">${formatted}</td>
      <td><strong>${escapeHtml(log.userName)}</strong><br><span class="subtext">${log.userRole.replace(/-/g,' ')}</span></td>
      <td>${escapeHtml(log.agencyName || 'Platform')}</td>
      <td><span class="badge ${actionClass}">${log.action.replace('CLIENT_','').replace('USER_','').replace('AGENCY_','')}</span></td>
      <td>${escapeHtml(log.details)}</td>`;
    tbody.appendChild(tr);
  });
}

// ---- Tab switching ----

async function switchTab(tabId) {
  currentTab = tabId;
  // Hide all sections
  ['dashboard', '.summary', '.insights', '.workspace', '#agenciesSection', '#employeesSection', '#auditLogsSection'].forEach(sel => {
    const el = sel.startsWith('#') || sel.startsWith('.') ? document.querySelector(sel) : document.getElementById(sel);
    if (el) el.classList.add('d-none');
  });
  document.getElementById('topbarActions').classList.remove('d-none');

  const titleEl    = document.getElementById('topbarTitle');
  const subtitleEl = document.getElementById('topbarSubtitle');
  const bulkBtn    = document.getElementById('bulkUploadBtn');
  const exportBtn  = document.getElementById('exportBtn');
  const newBtn     = document.getElementById('newBtn');
  bulkBtn.classList.add('d-none'); exportBtn.classList.add('d-none'); newBtn.classList.add('d-none');

  if (tabId === 'dashboard') {
    document.getElementById('dashboard').classList.remove('d-none');
    document.querySelector('.summary').classList.remove('d-none');
    if (currentUser.role === 'super-admin') {
      titleEl.textContent    = 'SaaS Platform Overview';
      subtitleEl.textContent = 'Global statistics and operational overview across all agencies.';
      try {
        const [agData, recData, empData, logData] = await Promise.all([
          API.agencies.list(),
          API.records.list(),
          API.employees.list(),
          API.logs.list(),
        ]);
        agencies  = agData.agencies;
        records   = recData.records;
        users     = empData.users;
        auditLogs = logData.logs;
      } catch (err) { showToast('Error loading data: ' + err.message); }
    } else {
      titleEl.textContent    = 'Client Records Dashboard';
      subtitleEl.textContent = 'Maintain appointments, processing status, payments, rejections and lost clients.';
      document.querySelector('.insights').classList.remove('d-none');
      if (currentUser.role === 'agency-owner') bulkBtn.classList.remove('d-none');
      exportBtn.classList.remove('d-none');
      newBtn.classList.remove('d-none');
    }
    renderSummary();
    if (currentUser.role !== 'super-admin') {
      renderInsights();
      renderOutstandingDues();
    }
  } else if (tabId === 'applications') {
    document.querySelector('.workspace').classList.remove('d-none');
    titleEl.textContent    = 'Manage Applications';
    subtitleEl.textContent = 'Search, filter, view and edit client record details.';
    if (currentUser.role === 'agency-owner') bulkBtn.classList.remove('d-none');
    exportBtn.classList.remove('d-none');
    newBtn.classList.remove('d-none');
    renderRecords();
  } else if (tabId === 'agencies') {
    document.getElementById('agenciesSection').classList.remove('d-none');
    titleEl.textContent    = 'Client Agencies';
    subtitleEl.textContent = 'Register, configure, and manage subscription access for consulting agencies.';
    try {
      const data = await API.agencies.list();
      agencies = data.agencies;
    } catch (err) { showToast('Error: ' + err.message); }
    renderAgencies();
  } else if (tabId === 'employees') {
    document.getElementById('employeesSection').classList.remove('d-none');
    titleEl.textContent    = 'Employee Administration';
    subtitleEl.textContent = 'Manage your team access, system privileges, and status.';
    try {
      const data = await API.employees.list();
      users = data.users;
    } catch (err) { showToast('Error: ' + err.message); }
    renderEmployees();
    populateFormDropdowns();
  } else if (tabId === 'logs') {
    document.getElementById('auditLogsSection').classList.remove('d-none');
    titleEl.textContent    = 'Audit History Logs';
    subtitleEl.textContent = currentUser.role === 'super-admin'
      ? 'System-wide activity log capturing administrative and transaction events.'
      : 'Agency activity log capturing client updates, user updates, imports, and exports.';
    await loadAndRenderLogs();
  }
}

async function loadAndRenderLogs() {
  try {
    const params = currentLogFilter ? { action: currentLogFilter } : {};
    const data   = await API.logs.list(params);
    auditLogs    = data.logs;
    renderAuditLogs();
  } catch (err) { showToast('Error loading logs: ' + err.message); }
}

// ---- Record CRUD ----

function setFormMode(mode) {
  const isView = mode === 'view';
  // Disable/enable every field except the hidden id field
  Object.entries(fields).forEach(([key, input]) => {
    if (key === 'id') return;
    input.disabled = isView;
  });
  document.getElementById('saveRecordBtn').classList.toggle('d-none', isView);
  document.getElementById('editBtn').classList.toggle('d-none', !isView);
  // Dim form to signal read-only state
  form.style.opacity = isView ? '0.88' : '1';
}

function resetForm() {
  form.reset();
  fields.id.value = '';
  setFormMode('edit');
  if (fields.assignedTo.querySelector(`option[value="${currentUser.id}"]`)) {
    fields.assignedTo.value = currentUser.id;
  }
  document.getElementById('formTitle').textContent = 'Add Record';
}

function viewRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  Object.entries(fields).forEach(([key, input]) => { input.value = record[key] ?? ''; });
  setFormMode('view');
  document.getElementById('formTitle').textContent = 'View Record';
}

function editRecord(id) {
  const record = id ? records.find(r => r.id === id) : records.find(r => r.id === fields.id.value);
  if (!record) return;
  Object.entries(fields).forEach(([key, input]) => { input.value = record[key] ?? ''; });
  setFormMode('edit');
  document.getElementById('formTitle').textContent = 'Edit Record';
  fields.clientName.focus();
}

function collectFormRecord() {
  return {
    clientName:         fields.clientName.value.trim(),
    phone:              fields.phone.value.trim(),
    dob:                fields.dob.value,
    referredBy:         fields.referredBy.value.trim(),
    service:            fields.service.value,
    status:             fields.status.value,
    appointmentDate:    fields.appointmentDate.value,
    appointmentTime:    fields.appointmentTime.value,
    appointmentCenter:  fields.appointmentCenter.value.trim(),
    passportExpiryDate: fields.passportExpiryDate.value,
    travelDate:         fields.travelDate.value,
    stage:              fields.stage.value,
    assignedTo:         fields.assignedTo.value,
    amount:             Number(fields.amount.value || 0),
    received:           Number(fields.received.value || 0),
    documentId:         fields.documentId.value.trim(),
    commissionAgent:    fields.commissionAgent.value.trim(),
    commissionAmount:   Number(fields.commissionAmount.value || 0),
    commissionPaid:     fields.commissionPaid.value === '1' ? 1 : 0,
    notes:              fields.notes.value.trim(),
  };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = collectFormRecord();
  const existingId = fields.id.value;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    if (existingId) {
      const res = await API.records.update(existingId, data);
      const idx = records.findIndex(r => r.id === existingId);
      if (idx >= 0) records[idx] = res.record; else records.unshift(res.record);
      showToast('Record updated.');
    } else {
      const res = await API.records.create(data);
      records.unshift(res.record);
      showToast('Record added.');
    }
    resetForm();
    renderRecords();
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

async function deleteRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  if (!confirm(`Delete ${record.clientName}'s record?`)) return;
  try {
    await API.records.remove(id);
    records = records.filter(r => r.id !== id);
    renderRecords();
    showToast('Record deleted.');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ---- Agency Management ----

async function toggleAgencyStatus(agencyId) {
  try {
    const res = await API.agencies.toggleStatus(agencyId);
    const idx = agencies.findIndex(a => a.id === res.agency.id);
    if (idx >= 0) agencies[idx] = { ...agencies[idx], ...res.agency };
    renderAgencies();
    showToast(`Agency ${res.agency.status === 'Active' ? 'activated' : 'suspended'}.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

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
    renderAgencies();
    closeModal('agencyModal');
    document.getElementById('agencyForm').reset();
    showToast(`Agency "${res.agency.name}" created.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('addAgencyBtn').addEventListener('click', () => {
  document.getElementById('agencyForm').reset();
  openModal('agencyModal');
});

// Agency table delegated click (toggle agency status)
document.getElementById('agenciesTable').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action="toggle-agency"]');
  if (btn) toggleAgencyStatus(Number(btn.dataset.id));
});

// ---- Employee Management ----

document.getElementById('employeeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const res = await API.employees.create({
      name:     document.getElementById('newEmpName').value.trim(),
      email:    document.getElementById('newEmpEmail').value.trim(),
      role:     document.getElementById('newEmpRole').value,
      password: document.getElementById('newEmpPassword').value,
    });
    users.push(res.user);
    renderEmployees();
    populateFormDropdowns();
    closeModal('employeeModal');
    document.getElementById('employeeForm').reset();
    showToast(`Employee "${res.user.name}" added.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('addEmployeeBtn').addEventListener('click', () => {
  document.getElementById('employeeForm').reset();
  openModal('employeeModal');
});

// Employee table delegated click
document.getElementById('employeesTable').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-action="delete-employee"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const u  = users.find(u => u.id === id);
  if (!u || !confirm(`Remove ${u.name} from the agency?`)) return;
  try {
    await API.employees.remove(id);
    users = users.filter(u => u.id !== id);
    renderEmployees();
    populateFormDropdowns();
    showToast('Employee removed.');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

// ---- Logs ----

document.getElementById('clearLogsBtn').addEventListener('click', async () => {
  if (!confirm('Clear audit logs? This action is permanent.')) return;
  try {
    await API.logs.clear();
    auditLogs = [];
    renderAuditLogs();
    showToast('Audit logs cleared.');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

document.getElementById('logActionFilter').addEventListener('change', e => {
  currentLogFilter = e.target.value;
  loadAndRenderLogs();
});

// ---- Filters & quick actions ----

function clearStandardFilters() {
  document.getElementById('search').value       = '';
  document.getElementById('statusFilter').value  = '';
  document.getElementById('paymentFilter').value = '';
  document.getElementById('employeeFilter').value = '';
  activeSpecialFilter = '';
}

function applyDashboardFilter(filter) {
  if (currentUser.role === 'super-admin') {
    if (['all','processing','renewals'].includes(filter)) switchTab('agencies');
    else if (filter === 'birthdays') switchTab('logs');
    return;
  }
  clearStandardFilters();
  if (filter === 'processing') document.getElementById('statusFilter').value = 'Processing';
  if (filter === 'completed')  document.getElementById('statusFilter').value = 'Completed';
  if (filter === 'due')        activeSpecialFilter = 'due';
  if (filter === 'received')   document.getElementById('paymentFilter').value = 'Received';
  if (filter === 'birthdays')  activeSpecialFilter = 'birthdays';
  if (filter === 'renewals')   activeSpecialFilter = 'renewals';
  renderRecords();
  scrollToSection(['birthdays','renewals'].includes(filter) ? filter : 'applications');
  showToast(filter === 'all' ? 'Showing all records.' : 'Dashboard filter applied.');
}

['search','statusFilter','paymentFilter','employeeFilter'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input',  () => { activeSpecialFilter = ''; renderRecords(); });
  el.addEventListener('change', () => { activeSpecialFilter = ''; renderRecords(); });
});

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => applyDashboardFilter(btn.dataset.filter));
});

document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.quick;
    if (q === 'appointments') {
      clearStandardFilters();
      document.getElementById('statusFilter').value = 'Appointment';
      renderRecords(); scrollToSection('applications');
      showToast('Showing appointment records.');
    } else if (q === 'processing') applyDashboardFilter('processing');
    else if (q === 'payments')     applyDashboardFilter('due');
    else if (q === 'reminders')    applyDashboardFilter('renewals');
  });
});

// Record action delegation
// Row click → view mode | explicit Edit button click → edit mode directly
[recordsTable, mobileCards, document.getElementById('birthdaysList'), document.getElementById('renewalsList')].forEach(container => {
  container.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    const row = e.target.closest('tr[data-action]');
    if (!btn && !row) return;
    if (btn && btn.dataset.action === 'delete') { deleteRecord(btn.dataset.id); return; }
    // Explicit "Edit" icon button in row → go straight to edit mode
    if (btn && btn.dataset.action === 'edit' && btn.classList.contains('icon-btn')) {
      editRecord(btn.dataset.id); scrollToSection('recordForm'); return;
    }
    // Row click or card Edit button or insight item → view mode first
    const id = btn ? btn.dataset.id : row.dataset.id;
    if (id) { viewRecord(id); scrollToSection('recordForm'); }
  });
});

document.getElementById('clearBtn').addEventListener('click', resetForm);
document.getElementById('newBtn').addEventListener('click', () => { resetForm(); scrollToSection('recordForm'); fields.clientName.focus(); });
document.getElementById('editBtn').addEventListener('click', () => { editRecord(null); });

// ---- Service fee auto-fill ----
fields.service.addEventListener('change', () => {
  if (fields.id.value) return; // don't override on existing record
  const fee = SERVICE_FEES[fields.service.value];
  if (fee && !Number(fields.amount.value)) fields.amount.value = fee;
});

// Theme
document.getElementById('lightThemeBtn').addEventListener('click', () => setTheme('light'));
document.getElementById('darkThemeBtn').addEventListener('click',  () => setTheme('dark'));

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await API.auth.logout();
  window.location.href = '/login';
});

// Modal close buttons
document.getElementById('closeAgencyModalBtn').addEventListener('click',    () => closeModal('agencyModal'));
document.getElementById('cancelAgencyModalBtn').addEventListener('click',   () => closeModal('agencyModal'));
document.getElementById('closeEmployeeModalBtn').addEventListener('click',  () => closeModal('employeeModal'));
document.getElementById('cancelEmployeeModalBtn').addEventListener('click', () => closeModal('employeeModal'));
document.getElementById('closeBulkUploadModalBtn').addEventListener('click',   () => closeModal('bulkUploadModal'));
document.getElementById('cancelBulkUploadModalBtn').addEventListener('click',  () => closeModal('bulkUploadModal'));

// ---- Bulk Upload ----
let uploadedRows = [], fileHeaders = [], fieldMapping = {}, parsedClients = [];
const targetFields = [
  { key: 'clientName', label: 'Client Name',      required: true  },
  { key: 'phone',      label: 'Phone',             required: true  },
  { key: 'dob',        label: 'Date of Birth',     required: false },
  { key: 'referredBy', label: 'Referred By',       required: false },
  { key: 'service',    label: 'Service',            required: false },
  { key: 'status',     label: 'Status',             required: false },
  { key: 'amount',     label: 'Payment Amount',     required: false },
  { key: 'received',   label: 'Received Amount',    required: false },
  { key: 'notes',      label: 'Notes',              required: false },
];

const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('csvFileInput');
const previewContainer = document.getElementById('uploadPreviewContainer');
const confirmBtn = document.getElementById('confirmUploadBtn');

uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { if (e.target.files[0]) processUploadedFile(e.target.files[0]); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--brand)'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = 'var(--line)'; });
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.style.borderColor = 'var(--line)';
  if (e.dataTransfer.files[0]) processUploadedFile(e.dataTransfer.files[0]);
});

function processUploadedFile(file) {
  const reader = new FileReader();
  reader.onload = e => parseCSVText(e.target.result);
  reader.readAsText(file);
}

function parseCSVText(text) {
  const rawRows = []; let row = []; let insideQuote = false; let field = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"') {
      if (insideQuote && next === '"') { field += '"'; i++; } else insideQuote = !insideQuote;
    } else if (char === ',' && !insideQuote) { row.push(field); field = ''; }
    else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some(f => f.trim())) rawRows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim())) rawRows.push(row); }
  if (rawRows.length < 2) { alert('File must contain headers and data.'); return; }
  fileHeaders = rawRows[0].map(h => h.trim());
  uploadedRows = rawRows.slice(1);
  autoMapFields(); renderMappingControls(); validateAndRenderUploadPreview();
  uploadZone.style.display = 'none'; previewContainer.style.display = 'block';
}

function autoMapFields() {
  fieldMapping = {};
  targetFields.forEach(tf => {
    fieldMapping[tf.key] = fileHeaders.findIndex(h => {
      const hh = h.toLowerCase(), k = tf.key.toLowerCase(), l = tf.label.toLowerCase();
      return hh === k || hh === l || hh.includes(k) || hh.includes(l) || l.includes(hh);
    });
  });
}

function renderMappingControls() {
  const grid = document.getElementById('mappingGrid');
  grid.innerHTML = '';
  targetFields.forEach(tf => {
    const div = document.createElement('div');
    div.className = 'mapping-field';
    let html = `<label for="map_${tf.key}">${tf.label}${tf.required ? ' *' : ''}</label>`;
    html += `<select id="map_${tf.key}"><option value="-1">-- Don't Import --</option>`;
    fileHeaders.forEach((h, i) => { html += `<option value="${i}"${fieldMapping[tf.key] === i ? ' selected' : ''}>${escapeHtml(h)}</option>`; });
    html += '</select>';
    div.innerHTML = html;
    div.querySelector('select').addEventListener('change', e => { fieldMapping[tf.key] = parseInt(e.target.value); validateAndRenderUploadPreview(); });
    grid.appendChild(div);
  });
}

function validateAndRenderUploadPreview() {
  const headerRow = document.getElementById('previewTableHeader');
  const body      = document.getElementById('previewTableBody');
  headerRow.innerHTML = targetFields.map(tf => `<th>${tf.label}</th>`).join('') + '<th>Status</th>';
  body.innerHTML = '';
  let validCount = 0, invalidCount = 0;
  parsedClients = [];

  uploadedRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const client = { assignedTo: currentUser.id, appointmentDate: '', passportExpiryDate: '', documentId: '', paymentStatus: 'Pending' };
    const errors = [];
    targetFields.forEach(tf => {
      const ci = fieldMapping[tf.key];
      let val  = ci >= 0 && ci < row.length ? row[ci].trim() : '';
      if (tf.required && !val) errors.push(`${tf.label} is required.`);
      if (tf.key === 'amount' || tf.key === 'received') {
        const n = Number(val);
        client[tf.key] = (val && isNaN(n)) ? (errors.push(`${tf.label} must be a number.`), 0) : (n || 0);
      } else client[tf.key] = val;
    });
    const a = client.amount || 0, r = client.received || 0;
    client.paymentStatus = r >= a && a > 0 ? 'Received' : r > 0 ? 'Partial Received' : 'Pending';
    const svcs = ['Passport','Visa','PAN Card','Aadhaar Update','Travel Insurance','Document Attestation','Other Consulting'];
    client.service = svcs.find(s => s.toLowerCase() === (client.service || '').toLowerCase()) || 'Other Consulting';
    const stats = ['Appointment','Processing','Completed','Rejected','Lost Client'];
    client.status = stats.find(s => s.toLowerCase() === (client.status || '').toLowerCase()) || 'Appointment';

    let cells = targetFields.map(tf => `<td>${escapeHtml(tf.key === 'amount' || tf.key === 'received' ? money(client[tf.key]) : client[tf.key])}</td>`).join('');
    if (errors.length) {
      invalidCount++;
      tr.className = 'invalid-row';
      cells += `<td><span class="row-error-text">${errors.map(escapeHtml).join('<br>')}</span></td>`;
    } else {
      validCount++;
      parsedClients.push(client);
      cells += '<td><span class="badge received">Valid</span></td>';
    }
    tr.innerHTML = cells;
    if (idx < 10) body.appendChild(tr);
  });

  if (uploadedRows.length > 10) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${targetFields.length + 1}" style="text-align:center;color:var(--muted);font-style:italic;">... and ${uploadedRows.length - 10} more rows</td>`;
    body.appendChild(tr);
  }

  document.getElementById('totalRowsCount').textContent  = uploadedRows.length;
  document.getElementById('validRowsCount').textContent   = validCount;
  document.getElementById('invalidRowsCount').textContent = invalidCount;
  confirmBtn.disabled = parsedClients.length === 0;
}

function resetBulkUploader() {
  uploadedRows = []; fileHeaders = []; fieldMapping = {}; parsedClients = [];
  fileInput.value = '';
  uploadZone.style.display = 'block'; previewContainer.style.display = 'none';
  confirmBtn.disabled = true;
}

document.getElementById('bulkUploadBtn').addEventListener('click', () => { resetBulkUploader(); openModal('bulkUploadModal'); });

confirmBtn.addEventListener('click', async () => {
  if (!parsedClients.length) return;
  confirmBtn.disabled = true;
  try {
    const res = await API.records.bulk({ records: parsedClients });
    records = res.records.concat(records);
    renderRecords();
    closeModal('bulkUploadModal');
    showToast(`Imported ${res.count} records.`);
  } catch (err) {
    showToast('Import failed: ' + err.message);
    confirmBtn.disabled = false;
  }
});

// ---- Bulk upload template download (15 sample rows) ----
document.getElementById('downloadTemplateBtn').addEventListener('click', e => {
  e.preventDefault();
  const headers = ['Client Name','Phone','Date of Birth','Referred By','Service','Status','Payment Amount','Received Amount','Notes'];
  const samples = [
    ['Arjun Kumar',     '9876543210', '1990-05-15', 'Justdial',          'Passport',             'Processing',  2500, 1000, 'Police verification pending'],
    ['Fatima Shaikh',   '9988776655', '1993-11-14', 'Agent - Ravi',      'Visa',                 'Appointment', 7500,    0, 'UK visa - bank statement needed'],
    ['Priya Nair',      '9123456780', '1985-08-22', 'Walk-in',           'Passport',             'Completed',   2500, 2500, 'Passport delivered to client'],
    ['Mohammed Aslam',  '9234567891', '1988-03-10', 'Google',            'Visa',                 'Processing',  5000, 2500, 'UAE visa - employment letter collected'],
    ['Sunita Rao',      '9345678912', '1995-07-18', 'Walk-in',           'PAN Card',             'Completed',    600,  600, 'e-PAN issued and delivered'],
    ['Ravi Shankar',    '9456789123', '1980-12-05', 'Agent - Priya',     'Document Attestation', 'Processing',  1800,  800, 'HRD attestation - awaiting state'],
    ['Ananya Menon',    '9567891234', '1997-04-25', 'Justdial',          'Passport',             'Appointment', 2500,    0, 'First passport - DOB proof needed'],
    ['Ibrahim Khan',    '9678912345', '1982-09-30', 'Existing Client',   'Visa',                 'Processing',  8000, 4000, 'Canada visa - PCC pending'],
    ['Deepa Krishnan',  '9789123456', '1991-01-12', 'Google',            'Passport',             'Completed',   2500, 2500, 'Tatkaal passport delivered'],
    ['Sanjay Gupta',    '9891234567', '1975-06-28', 'Walk-in',           'Travel Insurance',     'Completed',   1200, 1200, 'Policy issued for Europe trip'],
    ['Meera Pillai',    '9012345678', '1998-02-14', 'Facebook',          'Aadhaar Update',       'Processing',   350,  350, 'Address update - document submitted'],
    ['Vikram Singh',    '9123450987', '1987-10-08', 'Agent - Suresh',    'Visa',                 'Appointment', 9000,    0, 'Australia student visa - need IELTS score'],
    ['Lakshmi Devi',    '9234561098', '2000-05-20', 'Walk-in',           'Passport',             'Processing',  2500, 1000, 'Minor passport - guardian consent needed'],
    ['Hassan Ali',      '9345672109', '1978-08-16', 'Existing Client',   'Visa',                 'Completed',   3500, 3500, 'Dubai employment visa delivered'],
    ['Kavitha Balan',   '9456783210', '1992-03-31', 'Agent - Anjali',    'Document Attestation', 'Appointment', 1800,    0, 'Degree certificate attestation'],
  ];
  const csv = [headers, ...samples].map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  _downloadBlob(new Blob([csv], { type: 'text/csv' }), 'bulk_upload_template.csv');
});

// ---- Export column definitions ----
const EXPORT_COLUMNS = [
  { key: 'id',                 label: 'Record ID',        default: true  },
  { key: 'clientName',         label: 'Client Name',      default: true  },
  { key: 'phone',              label: 'Phone',            default: true  },
  { key: 'dob',                label: 'Date of Birth',    default: false },
  { key: 'service',            label: 'Service',          default: true  },
  { key: 'status',             label: 'Status',           default: true  },
  { key: 'stage',              label: 'Stage',            default: true  },
  { key: 'appointmentDate',    label: 'Appointment Date', default: true  },
  { key: 'appointmentTime',    label: 'Appt. Time',       default: false },
  { key: 'appointmentCenter',  label: 'Service Center',   default: true  },
  { key: 'passportExpiryDate', label: 'Passport Expiry',  default: false },
  { key: 'travelDate',         label: 'Travel Date',      default: false },
  { key: 'amount',             label: 'Fees',             default: true  },
  { key: 'received',           label: 'Received',         default: true  },
  { key: '_due',               label: 'Balance Due',      default: true  },
  { key: 'paymentStatus',      label: 'Payment Status',   default: true  },
  { key: 'referredBy',         label: 'Referred By',      default: false },
  { key: 'assignedToName',     label: 'Assigned To',      default: true  },
  { key: 'documentId',         label: 'Reference ID',     default: false },
  { key: 'commissionAgent',    label: 'Commission Agent', default: false },
  { key: 'commissionAmount',   label: 'Commission',       default: false },
  { key: 'commissionPaid',     label: 'Comm. Paid',       default: false },
  { key: 'notes',              label: 'Notes',            default: false },
];

function _downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _getExportRows(selectedKeys) {
  const cols = EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
  const filtered = getFilteredRecords();
  const rows = filtered.map(r => cols.map(col => {
    if (col.key === '_due')         return Number(r.amount || 0) - Number(r.received || 0);
    if (col.key === 'commissionPaid') return r.commissionPaid ? 'Yes' : 'No';
    if (col.key === 'assignedToName') return r.assignedToName || getUserName(r.assignedTo);
    return r[col.key] ?? '';
  }));
  return { cols, rows };
}

function _exportCSV(cols, rows) {
  const lines = [
    cols.map(c => `"${c.label}"`).join(','),
    ...rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(','))
  ].join('\n');
  _downloadBlob(new Blob([lines], { type: 'text/csv' }), 'agency_records.csv');
}

async function _exportExcel(cols, rows, agencyName) {
  try { await window._loadXLSX(); } catch {
    showToast('Could not load Excel library. Check internet connection.'); return;
  }
  const wsData = [cols.map(c => c.label), ...rows.map(r => r.map(v => String(v ?? '')))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.label.length + 2, 16) }));
  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Client Records');
  XLSX.writeFile(wb, 'agency_records.xlsx');
}

async function _exportPDF(cols, rows, agencyName) {
  try { await window._loadJsPDF(); } catch {
    showToast('Could not load PDF library. Check internet connection.'); return;
  }
  const { jsPDF } = window.jspdf;
  const landscape = cols.length > 9;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(agencyName, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Client Records  |  ${new Date().toLocaleDateString('en-IN')}  |  ${rows.length} record${rows.length !== 1 ? 's' : ''}`, 14, 21);

  // Strip ₹ — base jsPDF fonts don't include Devanagari/special chars
  const safeHdr  = cols.map(c => c.label.replace(/₹/g, 'Rs.'));
  const safeRows = rows.map(row => row.map(v => String(v ?? '').replace(/₹/g, 'Rs.')));

  doc.autoTable({
    head: [safeHdr],
    body: safeRows,
    startY: 26,
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 12, right: 12 },
  });

  doc.save('agency_records.pdf');
}

// ---- Export modal ----
function openExportModal() {
  const colList = document.getElementById('exportColumnList');
  colList.innerHTML = EXPORT_COLUMNS.map(col => `
    <label class="export-col-item ${col.default ? 'checked' : ''}" data-key="${col.key}">
      <input type="checkbox" value="${col.key}" ${col.default ? 'checked' : ''}> ${col.label}
    </label>`).join('');
  colList.querySelectorAll('label').forEach(lbl => {
    lbl.querySelector('input').addEventListener('change', () => {
      lbl.classList.toggle('checked', lbl.querySelector('input').checked);
      _updateExportCount();
    });
  });
  _updateExportCount();
  openModal('exportModal');
}

function _updateExportCount() {
  const checked = document.querySelectorAll('#exportColumnList input:checked').length;
  const total   = getFilteredRecords().length;
  document.getElementById('exportCountHint').textContent = `${total} records · ${checked} columns`;
}

document.getElementById('exportBtn').addEventListener('click', openExportModal);
document.getElementById('closeExportModalBtn').addEventListener('click', () => closeModal('exportModal'));
document.getElementById('cancelExportBtn').addEventListener('click', () => closeModal('exportModal'));

document.getElementById('exportSelectAllBtn').addEventListener('click', () => {
  const all = document.querySelectorAll('#exportColumnList input');
  const anyUnchecked = Array.from(all).some(cb => !cb.checked);
  all.forEach(cb => {
    cb.checked = anyUnchecked;
    cb.closest('label').classList.toggle('checked', anyUnchecked);
  });
  document.getElementById('exportSelectAllBtn').textContent = anyUnchecked ? 'Deselect All' : 'Select All';
  _updateExportCount();
});

document.querySelectorAll('.export-fmt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.export-fmt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('doExportBtn').addEventListener('click', async () => {
  const fmt  = document.querySelector('.export-fmt.active').dataset.fmt;
  const keys = Array.from(document.querySelectorAll('#exportColumnList input:checked')).map(cb => cb.value);
  if (!keys.length) { showToast('Please select at least one column.'); return; }

  const { cols, rows } = _getExportRows(keys);
  const agencyName = currentAgency ? currentAgency.name : 'Agency';
  const btn = document.getElementById('doExportBtn');
  btn.disabled = true; btn.textContent = 'Exporting…';

  try {
    if (fmt === 'csv')   _exportCSV(cols, rows);
    if (fmt === 'excel') await _exportExcel(cols, rows, agencyName);
    if (fmt === 'pdf')   await _exportPDF(cols, rows, agencyName);
    closeModal('exportModal');
    showToast(`Exported ${rows.length} records as ${fmt.toUpperCase()}.`);
  } catch (err) {
    showToast('Export failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Export';
  }
});

// Seed button
document.getElementById('seedBtn').addEventListener('click', async () => {
  showToast('Loading sample records from server…');
  try {
    const data = await API.records.list();
    records = data.records;
    renderRecords();
    showToast('Data refreshed from server.');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

// ---- Initialization ----

async function init() {
  setTheme(localStorage.getItem(themeStorageKey) || 'light');
  try {
    const { user } = await API.auth.me();
    currentUser = user;
  } catch {
    window.location.href = '/login';
    return;
  }

  // Redirect super-admin to dedicated admin portal
  if (currentUser.role === 'super-admin') {
    window.location.href = '/admin';
    return;
  }

  renderCurrentUserDisplay();

  // Load data
  try {
    const [recData, empData, agData] = await Promise.all([
      API.records.list(),
      API.employees.list(),
      API.agencies.list(),
    ]);
    records       = recData.records;
    users         = empData.users;
    agencies      = agData.agencies;
    currentAgency = agencies.find(a => a.id === currentUser.agencyId) || null;
  } catch (err) { showToast('Error loading data: ' + err.message); }

  renderNavigation();
  populateFormDropdowns();
  switchTab('dashboard');
}

init();
