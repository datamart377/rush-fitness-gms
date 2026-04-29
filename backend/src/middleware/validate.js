// Runs an array of express-validator chains, then 400s on any failures.
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (validations) => async (req, _res, next) => {
  for (const v of validations) {
    const result = await v.run(req);
    if (result.errors && result.errors.length) break;
  }
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));
  return next(new ApiError(400, 'Validation failed', details));
};

module.exports = validate;
