// Helpers used by all CRUD routes.  Hand-rolled (no ORM) to keep things obvious.
const ApiError = require('./ApiError');

// Convert an object's snake_case keys to camelCase for API responses.
// Handles digits too: "emergency_phone_2" → "emergencyPhone2".
function toCamelKey(k) {
  return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function camelize(row) {
  if (row == null) return row;
  if (Array.isArray(row)) return row.map(camelize);
  if (typeof row !== 'object' || row instanceof Date) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[toCamelKey(k)] = v;
  return out;
}

// camelCase → snake_case (for incoming patch bodies).
// Handles digits too: "emergencyPhone2" → "emergency_phone_2".
function toSnakeKey(k) {
  return k
    .replace(/([A-Z])/g, '_$1')           // before each uppercase letter
    .replace(/([a-zA-Z])(\d)/g, '$1_$2')  // between letters and digits
    .toLowerCase();
}

// Pick allowed fields off `body` and return a [columns, values] pair for SQL.
// `allowed` is an array of snake_case column names that this endpoint accepts.
function pickFields(body, allowed) {
  const cols = [];
  const vals = [];
  for (const [k, v] of Object.entries(body || {})) {
    const snake = toSnakeKey(k);
    if (allowed.includes(snake)) {
      cols.push(snake);
      vals.push(v === '' ? null : v);
    }
  }
  return { cols, vals };
}

// Build a parameterised INSERT and return the inserted row.
async function insert(client, table, body, allowed) {
  const { cols, vals } = pickFields(body, allowed);
  if (!cols.length) throw new ApiError(400, 'No valid fields to insert');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const r = await client.query(sql, vals);
  return camelize(r.rows[0]);
}

// Build a parameterised UPDATE.
async function updateById(client, table, id, body, allowed) {
  const { cols, vals } = pickFields(body, allowed);
  if (!cols.length) throw new ApiError(400, 'No valid fields to update');
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  vals.push(id);
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = $${vals.length} RETURNING *`;
  const r = await client.query(sql, vals);
  if (!r.rowCount) throw new ApiError(404, `${table} ${id} not found`);
  return camelize(r.rows[0]);
}

async function getById(client, table, id) {
  const r = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!r.rowCount) throw new ApiError(404, `${table} ${id} not found`);
  return camelize(r.rows[0]);
}

async function deleteById(client, table, id) {
  const r = await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  if (!r.rowCount) throw new ApiError(404, `${table} ${id} not found`);
}

// Pagination + simple search helper for list endpoints.
//   listRows(client, 'members', { limit, offset, where, params, orderBy })
async function listRows(client, table, opts = {}) {
  const { where = '', params = [], orderBy = 'created_at DESC', limit = 50, offset = 0 } = opts;
  const sql = `SELECT * FROM ${table} ${where ? 'WHERE ' + where : ''}
               ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const r = await client.query(sql, [...params, limit, offset]);
  const countR = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${table} ${where ? 'WHERE ' + where : ''}`,
    params
  );
  return { rows: r.rows.map(camelize), total: countR.rows[0].n };
}

// Parse ?limit & ?offset query params with sane caps.
function parsePagination(req) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

module.exports = {
  camelize,
  toSnakeKey,
  pickFields,
  insert,
  updateById,
  getById,
  deleteById,
  listRows,
  parsePagination,
};
