const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'discounts',
  entity: 'discount',
  // valid_from / valid_to / max_uses were added in migration 009 to make
  // the existing UI inputs persist. uses_count is bumped by checkout
  // logic, not by user input, so it is NOT in this list.
  fields: ['code', 'description', 'type', 'value', 'is_active',
           'valid_from', 'valid_to', 'max_uses'],
  searchCols: ['code', 'description'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('code').isString().trim().notEmpty(),
    body('type').isIn(['percent', 'flat']),
    body('value').isFloat({ min: 0 }),
    // Dates are optional but if present must be ISO calendar dates.
    body('valid_from').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('valid_to').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('max_uses').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }),
  ],
  updateValidations: [
    body('valid_from').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('valid_to').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('max_uses').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }),
  ],
});
