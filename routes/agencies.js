const express = require('express');
const bcrypt  = require('bcryptjs');
const db = require('../db');
const { toCamel, writeLog } = require('../utils');
const { requireSuperAdmin } = require('../middleware/role');

const router = express.Router();

// GET /api/agencies
router.get('/', async (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') {
    const agencies = await db.many('SELECT * FROM agencies ORDER BY created_at DESC');
    const withCounts = await Promise.all(agencies.map(async a => {
      const emp    = await db.one(`SELECT COUNT(*) AS c FROM users WHERE agency_id = $1 AND role != 'super-admin'`, [a.id]);
      const client = await db.one('SELECT COUNT(*) AS c FROM records WHERE agency_id = $1', [a.id]);
      return { ...toCamel(a), employeeCount: Number(emp.c), clientCount: Number(client.c) };
    }));
    return res.json({ agencies: withCounts });
  }
  const agency = await db.one('SELECT * FROM agencies WHERE id = $1', [u.agencyId]);
  return res.json({ agencies: agency ? [toCamel(agency)] : [] });
});

// POST /api/agencies
router.post('/', requireSuperAdmin, async (req, res) => {
  const { name, ownerName, ownerEmail, ownerPassword } = req.body || {};
  if (!name || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ error: 'Agency name, owner name, email and password are required.' });
  }
  const existing = await db.one('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [ownerEmail.trim()]);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const dbClient = await db.connect();
  let agencyId;
  try {
    await dbClient.query('BEGIN');
    const a = await dbClient.query(
      `INSERT INTO agencies (name, owner_name, owner_email, created_at) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name.trim(), ownerName.trim(), ownerEmail.trim().toLowerCase(), new Date().toISOString()]
    );
    agencyId = a.rows[0].id;
    const hash = bcrypt.hashSync(ownerPassword, 10);
    await dbClient.query(
      `INSERT INTO users (name, email, password_hash, role, agency_id, created_at) VALUES ($1,$2,$3,'agency-owner',$4,$5)`,
      [ownerName.trim(), ownerEmail.trim().toLowerCase(), hash, agencyId, new Date().toISOString()]
    );
    await dbClient.query('COMMIT');
  } catch (e) {
    await dbClient.query('ROLLBACK'); throw e;
  } finally {
    dbClient.release();
  }

  await writeLog(db, req.user, null, 'System Administration', 'AGENCY_CREATE', `Created agency: ${name.trim()}`);
  const agency = await db.one('SELECT * FROM agencies WHERE id = $1', [agencyId]);
  return res.status(201).json({ agency: toCamel(agency) });
});

// PUT /api/agencies/:id/status
router.put('/:id/status', requireSuperAdmin, async (req, res) => {
  const agency = await db.one('SELECT * FROM agencies WHERE id = $1', [Number(req.params.id)]);
  if (!agency) return res.status(404).json({ error: 'Agency not found.' });

  const newStatus = agency.status === 'Active' ? 'Suspended' : 'Active';
  await db.run('UPDATE agencies SET status = $1 WHERE id = $2', [newStatus, agency.id]);

  await writeLog(db, req.user, agency.id, agency.name, 'AGENCY_STATUS',
    `${newStatus === 'Active' ? 'Activated' : 'Suspended'} agency: ${agency.name}`);
  return res.json({ agency: toCamel({ ...agency, status: newStatus }) });
});

// DELETE /api/agencies/:id
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const agency = await db.one('SELECT * FROM agencies WHERE id = $1', [Number(req.params.id)]);
  if (!agency) return res.status(404).json({ error: 'Agency not found.' });
  await db.run('DELETE FROM agencies WHERE id = $1', [agency.id]);
  await writeLog(db, req.user, null, 'System Administration', 'AGENCY_DELETE', `Deleted agency: ${agency.name}`);
  return res.json({ ok: true });
});

module.exports = router;
