const express = require('express');
const db = require('../db');
const { toCamel, computePaymentStatus, writeLog } = require('../utils');
const { requireOwnerOrAbove } = require('../middleware/role');

const router = express.Router();

const VALID_SERVICES = ['Passport','Visa','PAN Card','Aadhaar Update','Travel Insurance','Document Attestation','Other Consulting'];
const VALID_STATUSES = ['Appointment','Processing','Completed','Rejected','Lost Client'];

function agencyFilter(req) {
  return req.user.role === 'super-admin' ? null : req.user.agencyId;
}

function rowsToRecords(rows) {
  return rows.map(r => {
    const record = toCamel(r);
    // assignedToName comes from the JOIN alias
    record.assignedToName = r.assigned_to_name || '';
    return record;
  });
}

// GET /api/records
router.get('/', (req, res) => {
  const { search, status, paymentStatus, assignedTo, agencyId } = req.query;
  const scopeAgency = agencyFilter(req);

  let query = `
    SELECT r.*, u.name AS assigned_to_name
    FROM records r
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE 1=1
  `;
  const params = [];

  if (scopeAgency) {
    query += ' AND r.agency_id = ?';
    params.push(scopeAgency);
  } else if (agencyId) {
    query += ' AND r.agency_id = ?';
    params.push(Number(agencyId));
  }

  if (status) { query += ' AND r.status = ?'; params.push(status); }
  if (paymentStatus) { query += ' AND r.payment_status = ?'; params.push(paymentStatus); }
  if (assignedTo) { query += ' AND r.assigned_to = ?'; params.push(Number(assignedTo)); }
  if (search) {
    const s = `%${search}%`;
    query += ' AND (r.client_name LIKE ? OR r.phone LIKE ? OR r.service LIKE ? OR r.document_id LIKE ? OR r.referred_by LIKE ? OR r.id LIKE ?)';
    params.push(s, s, s, s, s, s);
  }

  query += ' ORDER BY r.created_at DESC';
  const rows = db.prepare(query).all(...params);
  return res.json({ records: rowsToRecords(rows) });
});

// POST /api/records
router.post('/', (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(403).json({ error: 'Super admin cannot create records directly.' });

  const { clientName, phone, dob, referredBy, service, status, appointmentDate,
    passportExpiryDate, assignedTo, amount, received, documentId, notes,
    appointmentCenter, appointmentTime, stage, commissionAgent, commissionAmount,
    commissionPaid, travelDate } = req.body || {};

  if (!clientName || !phone) return res.status(400).json({ error: 'Client name and phone are required.' });

  const id = `CS-${Date.now().toString().slice(-6)}`;
  const payStatus = computePaymentStatus(amount, received);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO records (id, agency_id, client_name, phone, dob, referred_by, service, status,
      appointment_date, passport_expiry_date, assigned_to, amount, received, payment_status,
      document_id, notes, appointment_center, appointment_time, stage,
      commission_agent, commission_amount, commission_paid, travel_date,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, u.agencyId, clientName.trim(), phone.trim(), dob || '', referredBy || '',
    VALID_SERVICES.includes(service) ? service : 'Other Consulting',
    VALID_STATUSES.includes(status) ? status : 'Appointment',
    appointmentDate || '', passportExpiryDate || '',
    assignedTo ? Number(assignedTo) : null,
    Number(amount || 0), Number(received || 0), payStatus,
    documentId || '', notes || '',
    appointmentCenter || '', appointmentTime || '', stage || '',
    commissionAgent || '', Number(commissionAmount || 0),
    commissionPaid ? 1 : 0, travelDate || '',
    now, now);

  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(u.agencyId);
  writeLog(db, u, u.agencyId, agency ? agency.name : '', 'CLIENT_CREATE', `Created record ${id} (${clientName.trim()})`);

  const row = db.prepare('SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id = ?').get(id);
  return res.status(201).json({ record: rowsToRecords([row])[0] });
});

// PUT /api/records/:id
router.put('/:id', (req, res) => {
  const u = req.user;
  const existing = db.prepare('SELECT * FROM records WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Record not found.' });
  if (u.role !== 'super-admin' && existing.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  const { clientName, phone, dob, referredBy, service, status, appointmentDate,
    passportExpiryDate, assignedTo, amount, received, documentId, notes,
    appointmentCenter, appointmentTime, stage, commissionAgent, commissionAmount,
    commissionPaid, travelDate } = req.body || {};

  if (!clientName || !phone) return res.status(400).json({ error: 'Client name and phone are required.' });

  const payStatus = computePaymentStatus(amount, received);

  db.prepare(`
    UPDATE records SET client_name=?, phone=?, dob=?, referred_by=?, service=?, status=?,
      appointment_date=?, passport_expiry_date=?, assigned_to=?, amount=?, received=?,
      payment_status=?, document_id=?, notes=?,
      appointment_center=?, appointment_time=?, stage=?,
      commission_agent=?, commission_amount=?, commission_paid=?, travel_date=?,
      updated_at=?
    WHERE id=?
  `).run(clientName.trim(), phone.trim(), dob || '', referredBy || '',
    VALID_SERVICES.includes(service) ? service : existing.service,
    VALID_STATUSES.includes(status) ? status : existing.status,
    appointmentDate || '', passportExpiryDate || '',
    assignedTo ? Number(assignedTo) : null,
    Number(amount || 0), Number(received || 0), payStatus,
    documentId || '', notes || '',
    appointmentCenter || '', appointmentTime || '', stage || '',
    commissionAgent || '', Number(commissionAmount || 0),
    commissionPaid ? 1 : 0, travelDate || '',
    new Date().toISOString(), req.params.id);

  const agencyId = u.role === 'super-admin' ? existing.agency_id : u.agencyId;
  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(agencyId);
  writeLog(db, u, agencyId, agency ? agency.name : '', 'CLIENT_UPDATE', `Updated record ${req.params.id} (${clientName.trim()})`);

  const row = db.prepare('SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id = ?').get(req.params.id);
  return res.json({ record: rowsToRecords([row])[0] });
});

// DELETE /api/records/:id
router.delete('/:id', requireOwnerOrAbove, (req, res) => {
  const u = req.user;
  const existing = db.prepare('SELECT * FROM records WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Record not found.' });
  if (u.role !== 'super-admin' && existing.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);

  const agencyId = u.role === 'super-admin' ? existing.agency_id : u.agencyId;
  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(agencyId);
  writeLog(db, u, agencyId, agency ? agency.name : '', 'CLIENT_DELETE', `Deleted record ${req.params.id} (${existing.client_name})`);

  return res.json({ ok: true });
});

// POST /api/records/bulk
router.post('/bulk', requireOwnerOrAbove, (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(403).json({ error: 'Super admin cannot bulk import records.' });

  const { records: incoming } = req.body || {};
  if (!Array.isArray(incoming) || incoming.length === 0) return res.status(400).json({ error: 'No records provided.' });

  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO records (id, agency_id, client_name, phone, dob, referred_by, service, status,
      appointment_date, passport_expiry_date, assigned_to, amount, received, payment_status,
      document_id, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    const inserted = [];
    for (const r of items) {
      const id = `CS-${Date.now().toString().slice(-5)}${Math.floor(Math.random()*10)}`;
      const ps = computePaymentStatus(r.amount, r.received);
      insertStmt.run(id, u.agencyId, (r.clientName || '').trim(), (r.phone || '').trim(),
        r.dob || '', r.referredBy || '',
        VALID_SERVICES.includes(r.service) ? r.service : 'Other Consulting',
        VALID_STATUSES.includes(r.status) ? r.status : 'Appointment',
        r.appointmentDate || '', r.passportExpiryDate || '',
        r.assignedTo ? Number(r.assignedTo) : null,
        Number(r.amount || 0), Number(r.received || 0), ps,
        r.documentId || '', r.notes || '', now, now);
      inserted.push(id);
    }
    return inserted;
  });

  const insertedIds = insertMany(incoming);
  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(u.agencyId);
  writeLog(db, u, u.agencyId, agency ? agency.name : '', 'CLIENT_IMPORT', `Bulk imported ${insertedIds.length} records`);

  const rows = db.prepare(`
    SELECT r.*, u.name AS assigned_to_name FROM records r
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE r.id IN (${insertedIds.map(() => '?').join(',')})
  `).all(...insertedIds);

  return res.status(201).json({ records: rowsToRecords(rows), count: insertedIds.length });
});

module.exports = router;
