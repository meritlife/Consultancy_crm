const express = require('express');
const bcrypt  = require('bcryptjs');
const db = require('../db');
const { toCamel, writeLog } = require('../utils');
const { requireSuperAdmin } = require('../middleware/role');

const router = express.Router();

// GET /api/agencies
router.get('/', (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') {
    const agencies = db.prepare('SELECT * FROM agencies ORDER BY created_at DESC').all().map(toCamel);
    // Attach counts
    const withCounts = agencies.map(a => {
      const empCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE agency_id = ? AND role != 'super-admin'").get(a.id);
      const clientCount = db.prepare('SELECT COUNT(*) AS c FROM records WHERE agency_id = ?').get(a.id);
      return { ...a, employeeCount: empCount.c, clientCount: clientCount.c };
    });
    return res.json({ agencies: withCounts });
  }
  // non-admin: return own agency
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(u.agencyId);
  return res.json({ agencies: agency ? [toCamel(agency)] : [] });
});

// POST /api/agencies — create agency + owner user (super-admin only)
router.post('/', requireSuperAdmin, (req, res) => {
  const { name, ownerName, ownerEmail, ownerPassword } = req.body || {};
  if (!name || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ error: 'Agency name, owner name, email and password are required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'A user with that email already exists.' });

  const create = db.transaction(() => {
    const a = db.prepare(`
      INSERT INTO agencies (name, owner_name, owner_email) VALUES (?, ?, ?)
    `).run(name.trim(), ownerName.trim(), ownerEmail.trim().toLowerCase());
    const agencyId = a.lastInsertRowid;

    const hash = bcrypt.hashSync(ownerPassword, 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, agency_id)
      VALUES (?, ?, ?, 'agency-owner', ?)
    `).run(ownerName.trim(), ownerEmail.trim().toLowerCase(), hash, agencyId);

    return agencyId;
  });

  const agencyId = create();
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(agencyId);
  writeLog(db, req.user, null, 'System Administration', 'AGENCY_CREATE', `Created agency: ${name.trim()}`);
  return res.status(201).json({ agency: toCamel(agency) });
});

// PUT /api/agencies/:id/status — toggle Active/Suspended (super-admin only)
router.put('/:id/status', requireSuperAdmin, (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(Number(req.params.id));
  if (!agency) return res.status(404).json({ error: 'Agency not found.' });

  const newStatus = agency.status === 'Active' ? 'Suspended' : 'Active';
  db.prepare('UPDATE agencies SET status = ? WHERE id = ?').run(newStatus, agency.id);

  writeLog(db, req.user, agency.id, agency.name, 'AGENCY_STATUS', `${newStatus === 'Active' ? 'Activated' : 'Suspended'} agency: ${agency.name}`);
  return res.json({ agency: toCamel({ ...agency, status: newStatus }) });
});

// DELETE /api/agencies/:id (super-admin only)
router.delete('/:id', requireSuperAdmin, (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(Number(req.params.id));
  if (!agency) return res.status(404).json({ error: 'Agency not found.' });

  db.prepare('DELETE FROM agencies WHERE id = ?').run(agency.id);
  writeLog(db, req.user, null, 'System Administration', 'AGENCY_DELETE', `Deleted agency: ${agency.name}`);
  return res.json({ ok: true });
});

module.exports = router;
