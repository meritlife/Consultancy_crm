// Load .env
const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
  });
}

const db     = require('./index');
const bcrypt = require('bcryptjs');

const today = new Date();
function pad(n) { return String(n).padStart(2, '0'); }
function dateFromToday(days) {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function birthdayForToday(year) {
  return `${year}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
}

async function seed() {
  await db.ensureSchema();

  const existing = await db.one(`SELECT id FROM users WHERE role = 'super-admin' LIMIT 1`);
  if (existing) {
    console.log('Database already seeded. Skipping.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  const ROUNDS = 10;

  // Agencies
  const a1 = await db.run(`INSERT INTO agencies (name, owner_name, owner_email, status, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Apex Passport & Visa Consult', 'Alice', 'alice@apex.com', 'Active', '2026-01-10T10:00:00.000Z']);
  const a2 = await db.run(`INSERT INTO agencies (name, owner_name, owner_email, status, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Global Document Services', 'Bob', 'bob@global.com', 'Active', '2026-02-15T14:30:00.000Z']);
  const agency1Id = a1.id, agency2Id = a2.id;

  // Users
  const insertUser = async (name, email, password, role, agencyId, createdAt) => {
    const hash = bcrypt.hashSync(password, ROUNDS);
    const row = await db.run(`INSERT INTO users (name, email, password_hash, role, agency_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [name, email, hash, role, agencyId, 'Active', createdAt]);
    return row.id;
  };

  await insertUser('Super Admin',        'admin@saas.com',   'Admin@1234',  'super-admin',  null,      '2026-01-01T09:00:00.000Z');
  const aliceId = await insertUser('Alice (Owner)',      'alice@apex.com',   'Alice@1234',  'agency-owner', agency1Id, '2026-01-10T10:00:00.000Z');
  const ashaId  = await insertUser('Asha - Front Desk',  'asha@apex.com',    'Asha@1234',   'employee',     agency1Id, '2026-01-11T11:00:00.000Z');
  const rahulId = await insertUser('Rahul - Processing', 'rahul@apex.com',   'Rahul@1234',  'employee',     agency1Id, '2026-01-11T11:30:00.000Z');
  const bobId   = await insertUser('Bob (Owner)',        'bob@global.com',   'Bob@1234',    'agency-owner', agency2Id, '2026-02-15T14:30:00.000Z');
  const meenaId = await insertUser('Meena - Accounts',  'meena@global.com', 'Meena@1234',  'employee',     agency2Id, '2026-02-16T10:00:00.000Z');
  await insertUser('Jack - Agent',      'jack@global.com',  'Jack@1234',   'employee',     agency2Id, '2026-02-16T10:30:00.000Z');

  // Records
  const insertRecord = (id, agencyId, clientName, phone, dob, referredBy, service, status,
    apptDate, expiryDate, assignedTo, amount, received, payStatus, docId, notes) =>
    db.run(`INSERT INTO records (id, agency_id, client_name, phone, dob, referred_by, service, status,
      appointment_date, passport_expiry_date, assigned_to, amount, received, payment_status,
      document_id, notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [id, agencyId, clientName, phone, dob, referredBy, service, status,
       apptDate, expiryDate, assignedTo, amount, received, payStatus, docId, notes, now, now]);

  await insertRecord('CS-1001', agency1Id, 'Arjun Nair',   '9876543210', birthdayForToday(1990),
    'Justdial', 'Passport', 'Completed', '2026-06-03', dateFromToday(30), rahulId, 2500, 1500, 'Partial Received', 'PPT-4581', 'Police verification documents pending.');
  await insertRecord('CS-1002', agency1Id, 'Fatima Khan',  '9988776655', '1993-11-14',
    'Agent - Sameer', 'Visa', 'Appointment', '2026-06-04', dateFromToday(60), ashaId, 7500, 0, 'Pending', 'VSA-2026-18', 'Collect bank statement and employment letter.');
  await insertRecord('CS-1003', agency2Id, 'Ravi Patel',   '9123456780', '1987-08-09',
    'Walk-in', 'PAN Card', 'Completed', '2026-05-28', '', meenaId, 600, 600, 'Received', 'PAN-7720', 'Delivered e-PAN copy.');
  await insertRecord('CS-1004', agency1Id, 'Neha Sharma',  '9012345678', '1996-02-22',
    'Agent - Priya', 'Document Attestation', 'Rejected', '2026-05-30', '', aliceId, 1800, 800, 'Partial Received', 'ATT-1339', 'Name mismatch. Awaiting corrected certificate.');
  await insertRecord('CS-1005', agency1Id, 'Imran Shaikh', '9898989898', '1984-12-02',
    'Google', 'Travel Insurance', 'Lost Client', '2026-05-25', '', ashaId, 1200, 0, 'Pending', 'INS-4402', 'Client chose another provider.');

  // Audit logs
  const insertLog = (agencyId, agencyName, userId, userName, userRole, action, details, createdAt) =>
    db.run(`INSERT INTO audit_logs (agency_id, agency_name, user_id, user_name, user_role, action, details, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [agencyId, agencyName, userId, userName, userRole, action, details, createdAt]);

  await insertLog(agency1Id, 'Apex Passport & Visa Consult', aliceId, 'Alice (Owner)', 'agency-owner', 'CLIENT_CREATE', 'Created record CS-1001 (Arjun Nair)', '2026-05-30T10:00:00.000Z');
  await insertLog(agency1Id, 'Apex Passport & Visa Consult', ashaId,  'Asha - Front Desk', 'employee', 'CLIENT_UPDATE', 'Updated record CS-1001 (Arjun Nair): Police verification documents pending', '2026-05-30T11:15:00.000Z');
  await insertLog(agency2Id, 'Global Document Services',     bobId,   'Bob (Owner)', 'agency-owner', 'CLIENT_EXPORT', 'Exported client records to CSV (5 records)', '2026-05-31T09:30:00.000Z');

  console.log('Database seeded successfully.');
  console.log('  Super Admin:  admin@saas.com  /  Admin@1234');
  console.log('  Agency Owner: alice@apex.com  /  Alice@1234');
  console.log('  Employee:     asha@apex.com   /  Asha@1234');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
