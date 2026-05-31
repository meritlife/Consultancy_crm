// Load .env
const fs = require('fs');
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

// Initialize DB (runs schema)
require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// API routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/records',   requireAuth, require('./routes/records'));
app.use('/api/agencies',  requireAuth, require('./routes/agencies'));
app.use('/api/employees', requireAuth, require('./routes/employees'));
app.use('/api/logs',      requireAuth, require('./routes/logs'));

// Health check for Railway
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
});
