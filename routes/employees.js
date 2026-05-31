const express = require('express');
const bcrypt  = require('bcryptjs');
const db = require('../db');
const { toCamel, writeLog } = require('../utils');
const { requireOwnerOrAbove } = require('../middleware/role');

const router = express.Router();

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, agencyId: u.agency_id, status: u.status, createdAt: u.created_at };
}

// GET /api/employees
router.get('/', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'super-admin') {
    const agencyId = req.query.agencyId;
    if (agencyId) {
      rows = db.prepare("SELECT * FROM users WHERE agency_id = ? AND role != 'super-admin' ORDER BY created_at").all(Number(agencyId));
    } else {
      rows = db.prepare("SELECT * FROM users WHERE role != 'super-admin' ORDER BY created_at").all();
    }
  } else {
    rows = db.prepare("SELECT * FROM users WHERE agency_id = ? ORDER BY created_at").all(u.agencyId);
  }
  return res.json({ users: rows.map(safeUser) });
});

// POST /api/employees
router.post('/', requireOwnerOrAbove, (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') return res.status(400).json({ error: 'Use agency creation to add agency owners.' });

  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const validRoles = ['employee', 'agency-owner'];
  const userRole = validRoles.includes(role) ? role : 'employee';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, agency_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), email.trim().toLowerCase(), hash, userRole, u.agencyId);

  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(u.agencyId);
  writeLog(db, u, u.agencyId, agency ? agency.name : '', 'USER_CREATE', `Added employee: ${name.trim()} (${userRole})`);

  const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ user: safeUser(newUser) });
});

// DELETE /api/employees/:id
router.delete('/:id', requireOwnerOrAbove, (req, res) => {
  const u = req.user;
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === u.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
  if (u.role !== 'super-admin' && target.agency_id !== u.agencyId) return res.status(403).json({ error: 'Forbidden.' });

  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);

  const agency = db.prepare('SELECT name FROM agencies WHERE id = ?').get(u.agencyId || target.agency_id);
  writeLog(db, u, target.agency_id, agency ? agency.name : '', 'USER_DELETE', `Removed user: ${target.name}`);

  return res.json({ ok: true });
});

module.exports = router;
