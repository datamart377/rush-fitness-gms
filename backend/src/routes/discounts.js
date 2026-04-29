const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'discounts',
  entity: 'discount',
  fields: ['code', 'description', 'type', 'value', 'is_active'],
  searchCols: ['code', 'description'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('code').isString().trim().notEmpty(),
    body('type').isIn(['percent', 'flat']),
    body('value').isFloat({ min: 0 }),
  ],
});
