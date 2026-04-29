const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'plans',
  entity: 'plan',
  fields: ['code', 'name', 'category', 'price', 'duration_days', 'group_size', 'daily_rate', 'is_active'],
  searchCols: ['code', 'name'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('code').isString().trim().notEmpty(),
    body('name').isString().trim().notEmpty(),
    body('category').isIn(['gym', 'combo', 'prepaid', 'group']),
    body('price').isFloat({ min: 0 }),
    body('durationDays').isInt({ min: 1 }),
    body('groupSize').optional({ checkFalsy: true }).isInt({ min: 1 }),
    body('dailyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
  updateValidations: [
    body('name').optional().isString().trim().notEmpty(),
    body('price').optional().isFloat({ min: 0 }),
    body('durationDays').optional().isInt({ min: 1 }),
  ],
});
