const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'trainers',
  entity: 'trainer',
  fields: [
    'first_name', 'last_name', 'phone', 'email', 'gender', 'dob', 'national_id',
    'emergency_name', 'emergency_phone', 'emergency_phone_2', 'photo_url',
    'specialisation', 'hourly_rate', 'hired_on', 'is_active', 'notes', 'user_id',
  ],
  searchCols: ['first_name', 'last_name', 'phone', 'email', 'specialisation'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('firstName').isString().trim().notEmpty(),
    body('lastName').isString().trim().notEmpty(),
    body('phone').isString().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('specialisation').optional({ checkFalsy: true }).isString(),
    body('hourlyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
  updateValidations: [
    body('firstName').optional().isString().trim().notEmpty(),
    body('lastName').optional().isString().trim().notEmpty(),
    body('phone').optional().isString().trim().notEmpty(),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('hourlyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
});
