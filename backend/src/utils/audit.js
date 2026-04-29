// Best-effort audit logging. Never throws back into the request.
const { query } = require('../db/pool');

async function audit(req, action, entityType, entityId, metadata) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id || null,
        req.user?.username || null,
        action,
        entityType || null,
        entityId != null ? String(entityId) : null,
        req.ip || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Don't fail the request because of audit issues.
    console.error('[audit] failed:', err.message);
  }
}

module.exports = { audit };
