-- Consultancy CRM — PostgreSQL schema

CREATE TABLE IF NOT EXISTS agencies (
  id          SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  owner_name  TEXT    NOT NULL,
  owner_email TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  created_at  TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('super-admin', 'agency-owner', 'employee')),
  agency_id     INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  created_at    TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS records (
  id                   TEXT    PRIMARY KEY,
  agency_id            INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_name          TEXT    NOT NULL,
  phone                TEXT    NOT NULL,
  dob                  TEXT    NOT NULL DEFAULT '',
  referred_by          TEXT    NOT NULL DEFAULT '',
  service              TEXT    NOT NULL DEFAULT 'Other Consulting',
  status               TEXT    NOT NULL DEFAULT 'Appointment',
  appointment_date     TEXT    NOT NULL DEFAULT '',
  appointment_time     TEXT    NOT NULL DEFAULT '',
  appointment_center   TEXT    NOT NULL DEFAULT '',
  passport_expiry_date TEXT    NOT NULL DEFAULT '',
  travel_date          TEXT    NOT NULL DEFAULT '',
  stage                TEXT    NOT NULL DEFAULT '',
  assigned_to          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount               REAL    NOT NULL DEFAULT 0,
  received             REAL    NOT NULL DEFAULT 0,
  payment_status       TEXT    NOT NULL DEFAULT 'Pending',
  document_id          TEXT    NOT NULL DEFAULT '',
  commission_agent     TEXT    NOT NULL DEFAULT '',
  commission_amount    REAL    NOT NULL DEFAULT 0,
  commission_paid      INTEGER NOT NULL DEFAULT 0,
  notes                TEXT    NOT NULL DEFAULT '',
  created_at           TEXT    NOT NULL DEFAULT '',
  updated_at           TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  agency_id   INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  agency_name TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name   TEXT    NOT NULL,
  user_role   TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  details     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_records_agency    ON records(agency_id);
CREATE INDEX IF NOT EXISTS idx_records_status    ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_payment   ON records(payment_status);
CREATE INDEX IF NOT EXISTS idx_records_assigned  ON records(assigned_to);
CREATE INDEX IF NOT EXISTS idx_logs_agency       ON audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_logs_created      ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_agency      ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
