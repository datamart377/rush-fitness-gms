const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool, withTx } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { insert, updateById, getById, deleteById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'products';
const FIELDS = ['sku', 'name', 'description', 'category', 'price', 'cost', 'stock', 'reorder_level', 'is_active'];

router.use(requireAuth);

router.get(
  '/',
  validate([q('search').optional().isString().trim()]),
  asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req);
  const params = [];
  let where = '';
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    where = 'WHERE name ILIKE $1 OR sku ILIKE $1';
  }
  const r = await pool.query(
    `SELECT * FROM ${TABLE} ${where} ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE} ${where}`, params);
  res.json({ data: r.rows.map(camelize), pagination: { total: c.rows[0].n, limit, offset } });
}));

router.get('/:id', validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  res.json(await getById(pool, TABLE, req.params.id));
}));

router.post(
  '/',
  requireRole('admin', 'manager'),
  validate([
    body('name').isString().trim().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('cost').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const row = await insert(pool, TABLE, req.body, FIELDS);
    await audit(req, 'product.create', TABLE, row.id);
    res.status(201).json(row);
  })
);

router.patch(
  '/:id',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const row = await updateById(pool, TABLE, req.params.id, req.body, FIELDS);
    await audit(req, 'product.update', TABLE, row.id);
    res.json(row);
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    await deleteById(pool, TABLE, req.params.id);
    await audit(req, 'product.delete', TABLE, req.params.id);
    res.status(204).send();
  })
);

// ── POST /api/products/:id/sell  { memberId?, quantity, paymentMethod } ──
// Atomically decrements stock, records a product_sale and a payment.
router.post(
  '/:id/sell',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    param('id').isUUID(),
    body('quantity').isInt({ min: 1 }),
    body('memberId').optional({ checkFalsy: true }).isUUID(),
    body('paymentMethod').isIn(['cash', 'mpesa', 'card', 'bank_transfer']),
    body('reference').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      const p = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (!p.rowCount) throw new ApiError(404, 'Product not found');
      const product = p.rows[0];
      if (product.stock < req.body.quantity) throw new ApiError(409, 'Insufficient stock');

      const total = Number(product.price) * Number(req.body.quantity);
      await client.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [req.body.quantity, req.params.id]);

      const saleR = await client.query(
        `INSERT INTO product_sales (product_id, member_id, quantity, unit_price, total, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, req.body.memberId || null, req.body.quantity, product.price, total, req.user.id]
      );
      const sale = saleR.rows[0];

      const payR = await client.query(
        `INSERT INTO payments (member_id, product_sale_id, amount, currency, method, reference, type, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,'product',$7,'completed') RETURNING *`,
        [
          req.body.memberId || null,
          sale.id,
          total,
          process.env.CURRENCY || 'KES',
          req.body.paymentMethod,
          req.body.reference || null,
          req.user.id,
        ]
      );
      return { sale: camelize(sale), payment: camelize(payR.rows[0]) };
    });
    await audit(req, 'product.sell', TABLE, req.params.id, { quantity: req.body.quantity });
    res.status(201).json(out);
  })
);

module.exports = router;
