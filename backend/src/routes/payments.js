const express = require('express');
const { body, param, query: q } = require('express-validator');

const { pool, withTx } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { audit } = require('../utils/audit');
const { insert, getById, parsePagination, camelize } = require('../utils/crud');

const router = express.Router();
const TABLE = 'payments';
const FIELDS = [
  'member_id', 'membership_id', 'walk_in_id', 'product_sale_id',
  'amount', 'currency', 'method', 'status', 'reference', 'payer_phone',
  'card_brand', 'card_last4', 'discount_id', 'discount_amount', 'paid_at',
  'type', 'activity_id', 'notes', 'created_by',
];

router.use(requireAuth);

// LIST
router.get(
  '/',
  validate([
    q('memberId').optional().isUUID(),
    q('membershipId').optional().isUUID(),
    q('method').optional().isIn(['cash', 'mpesa', 'card', 'bank_transfer']),
    q('from').optional().isISO8601(),
    q('to').optional().isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const params = [];
    const conds = [];
    if (req.query.memberId)     { params.push(req.query.memberId);     conds.push(`member_id = $${params.length}`); }
    if (req.query.membershipId) { params.push(req.query.membershipId); conds.push(`membership_id = $${params.length}`); }
    if (req.query.method)       { params.push(req.query.method);       conds.push(`method = $${params.length}`); }
    if (req.query.from)         { params.push(req.query.from);         conds.push(`paid_at >= $${params.length}`); }
    if (req.query.to)           { params.push(req.query.to);           conds.push(`paid_at <= $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT * FROM ${TABLE} ${where} ORDER BY paid_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE} ${where}`, params);
    const sumR = await pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM ${TABLE} ${where}`, params);

    res.json({
      data: r.rows.map(camelize),
      pagination: { total: c.rows[0].n, limit, offset },
      summary: { totalAmount: Number(sumR.rows[0].total) },
    });
  })
);

router.get('/:id', validate([param('id').isUUID()]), asyncHandler(async (req, res) => {
  res.json(await getById(pool, TABLE, req.params.id));
}));

// CREATE — also bumps membership.total_paid if linked.
router.post(
  '/',
  requireRole('admin', 'manager', 'receptionist'),
  validate([
    body('amount').isFloat({ min: 0 }),
    body('method').isIn(['cash', 'mpesa', 'card', 'bank_transfer']),
    body('memberId').optional({ checkFalsy: true }).isUUID(),
    body('membershipId').optional({ checkFalsy: true }).isUUID(),
    body('discountId').optional({ checkFalsy: true }).isUUID(),
    body('discountAmount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('payerPhone').optional({ checkFalsy: true }).isString(),
    body('reference').optional({ checkFalsy: true }).isString(),
    body('cardLast4').optional({ checkFalsy: true }).isString().isLength({ min: 4, max: 4 }),
    body('type').optional().isIn(['membership', 'addon', 'walk_in', 'product', 'other']),
  ]),
  asyncHandler(async (req, res) => {
    const out = await withTx(async (client) => {
      const payload = {
        ...req.body,
        currency: req.body.currency || process.env.CURRENCY || 'KES',
        createdBy: req.user.id,
      };
      const payment = await insert(client, TABLE, payload, FIELDS);
      if (payment.membershipId) {
        await client.query(
          `UPDATE memberships SET total_paid = total_paid + $1 WHERE id = $2`,
          [payment.amount, payment.membershipId]
        );
      }
      return payment;
    });
    await audit(req, 'payment.create', TABLE, out.id, { amount: out.amount, method: out.method });
    res.status(201).json(out);
  })
);

// REFUND
router.post(
  '/:id/refund',
  requireRole('admin', 'manager'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const r = await pool.query(
      `UPDATE ${TABLE} SET status = 'refunded' WHERE id = $1 AND status = 'completed' RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) throw new ApiError(409, 'Payment cannot be refunded (already refunded or not found)');
    await audit(req, 'payment.refund', TABLE, req.params.id);
    res.json(camelize(r.rows[0]));
  })
);

module.exports = router;
