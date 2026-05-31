const express = require('express');
const bcrypt  = require('bcryptjs');
const db = require('../db');
const { writeLog } = require('../utils');
const { requireOwnerOrAbove } = require('../middleware/role');

const router = express.Router();

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, agencyId: u.agency_id, status: u.status, createdAt: u.created_at };
}

// GET /api/employees
router.get('/', async (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'super-admin') {
    const agencyId = req.query.agencyId;
    if (agencyId) {
      rows = await db.many(`SELECT * FROM users WHERE agency_id = $1 AND role != 'super-admin' ORDER BY created_at`, [Number(agencyId)]);
    } else {
      rows = await db.many(`SELECT * FROM users WHERE role != 'super-admin' ORDER BY created_at`);
    }
  } else {
    rows = await db.many('SELECT * FROM users WHERE agency_id = $1 ORDER BY created_at', [u.agencyId]);
  }
  return res.json({ users: rows.map(safeUser) });
});

// POST /api/employees
router.post('/', requireOwnerOrAbove, async (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(400).json({ error: 'Use agency creation to add agency owners.' });

  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const validRoles = ['employee', 'agency-owner'];
  const userRole = validRoles.includes(role) ? role : 'employee';

  const existing = await db.one('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const row = await db.run(
    `INSERT INTO users (name, email, password_hash, role, agency_id, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name.trim(), email.trim().toLowerCase(), hash, userRole, u.agencyId, new Date().toISOString()]
  );

  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [u.agencyId]);
  await writeLog(db, u, u.agencyId, agency ? agency.name : '', 'USER_CREATE', `Added employee: ${name.trim()} (${userRole})`);
  return res.status(201).json({ user: safeUser(row) });
});

// DELETE /api/employees/:id
router.delete('/:id', requireOwnerOrAbove, async (req, res) => {
  const u = req.user;
  const target = await db.one('SELECT * FROM users WHERE id = $1', [Number(req.params.id)]);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === u.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
  if (u.role !== 'super-admin' && target.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  await db.run('DELETE FROM users WHERE id = $1', [target.id]);

  const agencyId = u.agencyId || target.agency_id;
  const agency = await db.one('SELECT name FROM agencies WHERE id = $1', [agencyId]);
  await writeLog(db, u, target.agency_id, agency ? agency.name : '', 'USER_DELETE', `Removed user: ${target.name}`);
  return res.json({ ok: true });
});

module.exports = router;
