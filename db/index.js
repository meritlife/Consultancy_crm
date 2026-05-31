const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'consulting.db');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(schema);

// Additive migrations — safe to run on every start
const migrations = [
  `ALTER TABLE records ADD COLUMN appointment_center  TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE records ADD COLUMN appointment_time    TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE records ADD COLUMN stage               TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE records ADD COLUMN commission_agent    TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE records ADD COLUMN commission_amount   REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE records ADD COLUMN commission_paid     INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE records ADD COLUMN travel_date         TEXT NOT NULL DEFAULT ''`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists — skip */ }
}

module.exports = db;
