// Load .env (local dev only — Vercel injects env vars automatically)
const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#') && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const express      = require('express');
const cookieParser = require('cookie-parser');
const requireAuth  = require('./middleware/auth');

// Ensure DB schema is created on cold start
require('./db').ensureSchema().catch(console.error);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// API routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/records',   requireAuth, require('./routes/records'));
app.use('/api/agencies',  requireAuth, require('./routes/agencies'));
app.use('/api/employees', requireAuth, require('./routes/employees'));
app.use('/api/logs',      requireAuth, require('./routes/logs'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Page routes
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Local dev: start server normally
// Vercel: exports the app as a serverless function
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

module.exports = app;
