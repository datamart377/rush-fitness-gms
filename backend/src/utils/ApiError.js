// Lightweight typed error so route code can `throw new ApiError(404, '…')`.
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
module.exports = ApiError;
