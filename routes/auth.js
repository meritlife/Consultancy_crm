const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, agencyId: user.agency_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, agencyId: user.agency_id };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await db.one('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.status === 'Suspended') {
    return res.status(403).json({ error: 'Your account is suspended. Contact support.' });
  }
  res.cookie('token', signToken(user), cookieOpts());
  return res.json({ user: safeUser(user) });
});

router.post('/register', async (req, res) => {
  const { name, email, password, role, agencyId } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existing = await db.one('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role || 'employee';
  const now = new Date().toISOString();
  const row = await db.run(
    `INSERT INTO users (name, email, password_hash, role, agency_id, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name.trim(), email.trim().toLowerCase(), hash, userRole, agencyId || null, now]
  );
  res.cookie('token', signToken(row), cookieOpts());
  return res.status(201).json({ user: safeUser(row) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
