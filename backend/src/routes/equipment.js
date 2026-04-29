const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'equipment',
  entity: 'equipment',
  fields: ['name', 'category', 'serial_number', 'purchased_on', 'purchase_cost', 'status', 'last_serviced', 'notes'],
  searchCols: ['name', 'serial_number', 'category'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('name').isString().trim().notEmpty(),
    body('status').optional().isIn(['operational', 'maintenance', 'retired']),
    body('purchaseCost').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
  updateValidations: [
    body('status').optional().isIn(['operational', 'maintenance', 'retired']),
  ],
});
