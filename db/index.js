const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Run schema on first connection
let schemaRun = false;
async function ensureSchema() {
  if (schemaRun) return;
  schemaRun = true;
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

pool.on('connect', () => ensureSchema().catch(console.error));

// Convenience helpers
const db = {
  // Return first row or null
  one: async (sql, params = []) => {
    const res = await pool.query(sql, params);
    return res.rows[0] || null;
  },
  // Return all rows
  many: async (sql, params = []) => {
    const res = await pool.query(sql, params);
    return res.rows;
  },
  // Run write query, return first row if RETURNING clause present
  run: async (sql, params = []) => {
    const res = await pool.query(sql, params);
    return res.rows[0] || null;
  },
  // Execute schema/DDL
  exec: async (sql) => pool.query(sql),
  // Get a client for transactions
  connect: () => pool.connect(),
  ensureSchema,
};

module.exports = db;
