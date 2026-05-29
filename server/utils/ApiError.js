// A small typed error carrying an HTTP status, surfaced by the error middleware.
export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(msg = 'Bad request', details) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Unauthorized') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'Forbidden') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'Conflict', details) {
    return new ApiError(409, msg, details);
  }
  static unprocessable(msg = 'Unprocessable entity', details) {
    return new ApiError(422, msg, details);
  }
  static tooMany(msg = 'Too many requests') {
    return new ApiError(429, msg);
  }
}

export default ApiError;
