export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'You need to sign in') => new AppError(401, msg);
export const forbidden = (msg = 'You do not have access to that') => new AppError(403, msg);
export const notFound = (msg = 'Not found') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);

/** Wraps an async route so a rejected promise reaches the error handler. */
export const handler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
