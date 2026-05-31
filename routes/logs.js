const express = require('express');
const db = require('../db');
const { toCamel } = require('../utils');

const router = express.Router();

// GET /api/logs
router.get('/', (req, res) => {
  const u = req.user;
  const { action } = req.query;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (u.role !== 'super-admin') {
    query += ' AND agency_id = ?';
    params.push(u.agencyId);
  }
  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  query += ' ORDER BY created_at DESC LIMIT 500';

  const rows = db.prepare(query).all(...params);
  return res.json({ logs: rows.map(toCamel) });
});

// DELETE /api/logs — clear logs
router.delete('/', (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') {
    db.prepare('DELETE FROM audit_logs').run();
  } else {
    db.prepare('DELETE FROM audit_logs WHERE agency_id = ?').run(u.agencyId);
  }
  return res.json({ ok: true });
});

module.exports = router;
