const ApiError = require('../utils/ApiError');

// 404 fallthrough.
function notFound(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

// Maps Postgres errors to friendly HTTP responses.
function mapPgError(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return new ApiError(409, 'Duplicate value violates a unique constraint', { detail: err.detail });
    case '23503': // foreign_key_violation
      return new ApiError(409, 'Referenced row does not exist', { detail: err.detail });
    case '23502': // not_null_violation
      return new ApiError(400, `Missing required field: ${err.column}`);
    case '23514': // check_violation
      return new ApiError(400, 'Value violates a check constraint', { detail: err.detail });
    case '22P02': // invalid_text_representation (e.g. bad UUID)
      return new ApiError(400, 'Invalid identifier or value format');
    default:
      return null;
  }
}

function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err && err.code && /^\d+/.test(err.code)) {
    const mapped = mapPgError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message, details: mapped.details });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
