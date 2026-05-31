function toCamel(row) {
  if (!row) return row;
  const out = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = row[key];
  }
  return out;
}

function computePaymentStatus(amount, received) {
  const a = Number(amount || 0);
  const r = Number(received || 0);
  if (r >= a && a > 0) return 'Received';
  if (r > 0 && r < a) return 'Partial Received';
  return 'Pending';
}

async function writeLog(db, user, agencyId, agencyName, action, details) {
  await db.run(`
    INSERT INTO audit_logs (agency_id, agency_name, user_id, user_name, user_role, action, details, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [agencyId || null, agencyName || null, user.id, user.name, user.role, action, details || '', new Date().toISOString()]);
}

module.exports = { toCamel, computePaymentStatus, writeLog };
