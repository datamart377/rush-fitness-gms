// Factory for a standard list/get/create/update/delete router.
// Resources with custom logic (members, memberships, payments, attendance,
// auth, walk-ins) define their own router instead.
const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('./asyncHandler');
const ApiError = require('./ApiError');
const { audit } = require('./audit');
const {
  insert,
  updateById,
  getById,
  deleteById,
  parsePagination,
  camelize,
} = require('./crud');

/**
 * @param {object} cfg
 * @param {string} cfg.table        SQL table name
 * @param {string[]} cfg.fields     allowed snake_case columns for create/update
 * @param {string} [cfg.entity]     audit entity name (defaults to table singular-ish)
 * @param {string[]} [cfg.searchCols] columns to ILIKE-search via ?search=
 * @param {string[]} [cfg.writeRoles] roles allowed to create/update (default admin,manager)
 * @param {string[]} [cfg.deleteRoles] roles allowed to delete (default admin)
 * @param {Array}    [cfg.createValidations] extra express-validator chains for POST
 * @param {Array}    [cfg.updateValidations] extra chains for PATCH
 */
function makeCrudRouter(cfg) {
  const router = express.Router();
  const {
    table,
    fields,
    entity = table.replace(/s$/, ''),
    searchCols = [],
    writeRoles = ['admin', 'manager'],
    deleteRoles = ['admin'],
    createValidations = [],
    updateValidations = [],
  } = cfg;

  router.use(requireAuth);

  // LIST
  router.get(
    '/',
    validate([q('search').optional().isString().trim()]),
    asyncHandler(async (req, res) => {
      const { limit, offset } = parsePagination(req);
      const params = [];
      let where = '';
      if (req.query.search && searchCols.length) {
        params.push(`%${req.query.search}%`);
        const cond = searchCols.map((c) => `${c} ILIKE $1`).join(' OR ');
        where = `WHERE ${cond}`;
      }
      const sql = `SELECT * FROM ${table} ${where}
                   ORDER BY created_at DESC
                   LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const rowsR = await pool.query(sql, [...params, limit, offset]);
      const countR = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} ${where}`, params);
      res.json({
        data: rowsR.rows.map(camelize),
        pagination: { total: countR.rows[0].n, limit, offset },
      });
    })
  );

  // GET BY ID
  router.get(
    '/:id',
    validate([param('id').isUUID()]),
    asyncHandler(async (req, res) => {
      const row = await getById(pool, table, req.params.id);
      res.json(row);
    })
  );

  // CREATE
  router.post(
    '/',
    requireRole(...writeRoles),
    validate(createValidations),
    asyncHandler(async (req, res) => {
      const row = await insert(pool, table, req.body, fields);
      await audit(req, `${entity}.create`, table, row.id);
      res.status(201).json(row);
    })
  );

  // UPDATE
  router.patch(
    '/:id',
    requireRole(...writeRoles),
    validate([param('id').isUUID(), ...updateValidations]),
    asyncHandler(async (req, res) => {
      const row = await updateById(pool, table, req.params.id, req.body, fields);
      await audit(req, `${entity}.update`, table, row.id);
      res.json(row);
    })
  );

  // DELETE
  router.delete(
    '/:id',
    requireRole(...deleteRoles),
    validate([param('id').isUUID()]),
    asyncHandler(async (req, res) => {
      await deleteById(pool, table, req.params.id);
      await audit(req, `${entity}.delete`, table, req.params.id);
      res.status(204).send();
    })
  );

  return router;
}

module.exports = makeCrudRouter;
