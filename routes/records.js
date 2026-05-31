const express = require('express');
const db = require('../db');
const { toCamel, computePaymentStatus, writeLog } = require('../utils');
const { requireOwnerOrAbove } = require('../middleware/role');

const router = express.Router();

const VALID_SERVICES = ['Passport','Visa','PAN Card','Aadhaar Update','Travel Insurance','Document Attestation','Other Consulting'];
const VALID_STATUSES = ['Appointment','Processing','Completed','Rejected','Lost Client'];

function scopeAgency(req) {
  return req.user.role === 'super-admin' ? null : req.user.agencyId;
}

function rowsToRecords(rows) {
  return rows.map(r => {
    const rec = toCamel(r);
    rec.assignedToName = r.assigned_to_name || '';
    return rec;
  });
}

// GET /api/records
router.get('/', async (req, res) => {
  const { search, status, paymentStatus, assignedTo, agencyId } = req.query;
  const scope = scopeAgency(req);

  let sql = `SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE 1=1`;
  const params = [];
  let pi = 1;

  if (scope)      { sql += ` AND r.agency_id = $${pi++}`;      params.push(scope); }
  else if (agencyId) { sql += ` AND r.agency_id = $${pi++}`;   params.push(Number(agencyId)); }
  if (status)        { sql += ` AND r.status = $${pi++}`;       params.push(status); }
  if (paymentStatus) { sql += ` AND r.payment_status = $${pi++}`; params.push(paymentStatus); }
  if (assignedTo)    { sql += ` AND r.assigned_to = $${pi++}`;  params.push(Number(assignedTo)); }
  if (search) {
    const s = `%${search}%`;
    sql += ` AND (r.client_name ILIKE $${pi} OR r.phone LIKE $${pi+1} OR r.service ILIKE $${pi+2} OR r.document_id ILIKE $${pi+3} OR r.referred_by ILIKE $${pi+4} OR r.id ILIKE $${pi+5})`;
    params.push(s, s, s, s, s, s); pi += 6;
  }
  sql += ' ORDER BY r.created_at DESC';

  const rows = await db.many(sql, params);
  return res.json({ records: rowsToRecords(rows) });
});

// POST /api/records
router.post('/', async (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(403).json({ error: 'Super admin cannot create records directly.' });

  const { clientName, phone, dob, referredBy, service, status, appointmentDate, appointmentTime,
    appointmentCenter, passportExpiryDate, travelDate, stage, assignedTo, amount, received,
    documentId, commissionAgent, commissionAmount, commissionPaid, notes } = req.body || {};

  if (!clientName || !phone) return res.status(400).json({ error: 'Client name and phone are required.' });

  const id = `CS-${Date.now().toString().slice(-6)}`;
  const payStatus = computePaymentStatus(amount, received);
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO records (id, agency_id, client_name, phone, dob, referred_by, service, status,
      appointment_date, appointment_time, appointment_center, passport_expiry_date, travel_date, stage,
      assigned_to, amount, received, payment_status, document_id, commission_agent, commission_amount,
      commission_paid, notes, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
    [id, u.agencyId, clientName.trim(), phone.trim(), dob || '', referredBy || '',
     VALID_SERVICES.includes(service) ? service : 'Other Consulting',
     VALID_STATUSES.includes(status) ? status : 'Appointment',
     appointmentDate || '', appointmentTime || '', appointmentCenter || '',
     passportExpiryDate || '', travelDate || '', stage || '',
     assignedTo ? Number(assignedTo) : null,
     Number(amount || 0), Number(received || 0), payStatus,
     documentId || '', commissionAgent || '', Number(commissionAmount || 0),
     commissionPaid ? 1 : 0, notes || '', now, now]);

  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [u.agencyId]);
  await writeLog(db, u, u.agencyId, agency ? agency.name : '', 'CLIENT_CREATE', `Created record ${id} (${clientName.trim()})`);

  const row = await db.one(`SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id = $1`, [id]);
  return res.status(201).json({ record: rowsToRecords([row])[0] });
});

// PUT /api/records/:id
router.put('/:id', async (req, res) => {
  const u = req.user;
  const existing = await db.one('SELECT * FROM records WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Record not found.' });
  if (u.role !== 'super-admin' && existing.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  const { clientName, phone, dob, referredBy, service, status, appointmentDate, appointmentTime,
    appointmentCenter, passportExpiryDate, travelDate, stage, assignedTo, amount, received,
    documentId, commissionAgent, commissionAmount, commissionPaid, notes } = req.body || {};

  if (!clientName || !phone) return res.status(400).json({ error: 'Client name and phone are required.' });

  const payStatus = computePaymentStatus(amount, received);

  await db.run(`
    UPDATE records SET client_name=$1, phone=$2, dob=$3, referred_by=$4, service=$5, status=$6,
      appointment_date=$7, appointment_time=$8, appointment_center=$9, passport_expiry_date=$10,
      travel_date=$11, stage=$12, assigned_to=$13, amount=$14, received=$15, payment_status=$16,
      document_id=$17, commission_agent=$18, commission_amount=$19, commission_paid=$20,
      notes=$21, updated_at=$22
    WHERE id=$23`,
    [clientName.trim(), phone.trim(), dob || '', referredBy || '',
     VALID_SERVICES.includes(service) ? service : existing.service,
     VALID_STATUSES.includes(status) ? status : existing.status,
     appointmentDate || '', appointmentTime || '', appointmentCenter || '',
     passportExpiryDate || '', travelDate || '', stage || '',
     assignedTo ? Number(assignedTo) : null,
     Number(amount || 0), Number(received || 0), payStatus,
     documentId || '', commissionAgent || '', Number(commissionAmount || 0),
     commissionPaid ? 1 : 0, notes || '', new Date().toISOString(), req.params.id]);

  const agencyId = u.role === 'super-admin' ? existing.agency_id : u.agencyId;
  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [agencyId]);
  await writeLog(db, u, agencyId, agency ? agency.name : '', 'CLIENT_UPDATE', `Updated record ${req.params.id} (${clientName.trim()})`);

  const row = await db.one(`SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id = $1`, [req.params.id]);
  return res.json({ record: rowsToRecords([row])[0] });
});

// DELETE /api/records/:id
router.delete('/:id', requireOwnerOrAbove, async (req, res) => {
  const u = req.user;
  const existing = await db.one('SELECT * FROM records WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Record not found.' });
  if (u.role !== 'super-admin' && existing.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  await db.run('DELETE FROM records WHERE id = $1', [req.params.id]);

  const agencyId = u.role === 'super-admin' ? existing.agency_id : u.agencyId;
  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [agencyId]);
  await writeLog(db, u, agencyId, agency ? agency.name : '', 'CLIENT_DELETE', `Deleted record ${req.params.id} (${existing.client_name})`);
  return res.json({ ok: true });
});

// POST /api/records/bulk
router.post('/bulk', requireOwnerOrAbove, async (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(403).json({ error: 'Super admin cannot bulk import records.' });

  const { records: incoming } = req.body || {};
  if (!Array.isArray(incoming) || incoming.length === 0) return res.status(400).json({ error: 'No records provided.' });

  const now = new Date().toISOString();
  const client = await db.connect();
  const insertedIds = [];

  try {
    await client.query('BEGIN');
    for (const r of incoming) {
      const id = `CS-${Date.now().toString().slice(-5)}${Math.floor(Math.random()*10)}`;
      const ps = computePaymentStatus(r.amount, r.received);
      await client.query(`
        INSERT INTO records (id, agency_id, client_name, phone, dob, referred_by, service, status,
          appointment_date, passport_expiry_date, assigned_to, amount, received, payment_status,
          document_id, notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [id, u.agencyId, (r.clientName || '').trim(), (r.phone || '').trim(),
         r.dob || '', r.referredBy || '',
         VALID_SERVICES.includes(r.service) ? r.service : 'Other Consulting',
         VALID_STATUSES.includes(r.status) ? r.status : 'Appointment',
         r.appointmentDate || '', r.passportExpiryDate || '',
         r.assignedTo ? Number(r.assignedTo) : null,
         Number(r.amount || 0), Number(r.received || 0), ps,
         r.documentId || '', r.notes || '', now, now]);
      insertedIds.push(id);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [u.agencyId]);
  await writeLog(db, u, u.agencyId, agency ? agency.name : '', 'CLIENT_IMPORT', `Bulk imported ${insertedIds.length} records`);

  const placeholders = insertedIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await db.many(
    `SELECT r.*, u.name AS assigned_to_name FROM records r LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id IN (${placeholders})`,
    insertedIds
  );
  return res.status(201).json({ records: rowsToRecords(rows), count: insertedIds.length });
});

module.exports = router;
