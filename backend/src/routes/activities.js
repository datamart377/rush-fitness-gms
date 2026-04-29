const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'activities',
  entity: 'activity',
  fields: ['code', 'name', 'standalone_price', 'addon_price', 'description', 'is_active'],
  searchCols: ['code', 'name'],
  createValidations: [
    body('code').isString().trim().notEmpty(),
    body('name').isString().trim().notEmpty(),
    body('standalonePrice').optional().isFloat({ min: 0 }),
    body('addonPrice').optional().isFloat({ min: 0 }),
  ],
  updateValidations: [
    body('name').optional().isString().trim().notEmpty(),
    body('standalonePrice').optional().isFloat({ min: 0 }),
    body('addonPrice').optional().isFloat({ min: 0 }),
  ],
});
