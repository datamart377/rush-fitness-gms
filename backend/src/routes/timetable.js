const { body } = require('express-validator');
const makeCrudRouter = require('../utils/makeCrudRouter');

module.exports = makeCrudRouter({
  table: 'timetable',
  entity: 'timetable',
  fields: ['activity_id', 'day_of_week', 'start_time', 'end_time', 'trainer_id', 'capacity', 'is_active'],
  writeRoles: ['admin', 'manager'],
  createValidations: [
    body('activityId').isUUID(),
    body('dayOfWeek').isInt({ min: 0, max: 6 }),
    body('startTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('trainerId').optional({ checkFalsy: true }).isUUID(),
    body('capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
  ],
  updateValidations: [
    body('startTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
  ],
});
