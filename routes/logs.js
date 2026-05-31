const express = require('express');
const db = require('../db');
const { toCamel } = require('../utils');

const router = express.Router();

// GET /api/logs
router.get('/', async (req, res) => {
  const u = req.user;
  const { action } = req.query;
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  let pi = 1;

  if (u.role !== 'super-admin') { sql += ` AND agency_id = $${pi++}`; params.push(u.agencyId); }
  if (action)                   { sql += ` AND action = $${pi++}`;    params.push(action); }
  sql += ' ORDER BY created_at DESC LIMIT 500';

  const rows = await db.many(sql, params);
  return res.json({ logs: rows.map(toCamel) });
});

// DELETE /api/logs
router.delete('/', async (req, res) => {
  const u = req.user;
  if (u.role === 'super-admin') {
    await db.run('DELETE FROM audit_logs');
  } else {
    await db.run('DELETE FROM audit_logs WHERE agency_id = $1', [u.agencyId]);
  }
  return res.json({ ok: true });
});

module.exports = router;
