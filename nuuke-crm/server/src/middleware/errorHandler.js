import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { isProd } from '../env.js';

/** Turns Postgres integrity errors into messages a person can act on. */
function fromPostgres(err) {
  switch (err.code) {
    case '23505': return { status: 409, message: 'Something with that value already exists', details: err.detail };
    case '23503': return { status: 400, message: 'That references a record which does not exist', details: err.detail };
    case '23514': return { status: 400, message: 'That value is not allowed for this field', details: err.detail };
    case '22P02': return { status: 400, message: 'One of the values is the wrong type' };
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Some fields need fixing',
      fields: err.issues.reduce((acc, i) => {
        acc[i.path.join('.') || '_'] = i.message;
        return acc;
      }, {}),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  const pg = err.code ? fromPostgres(err) : null;
  if (pg) return res.status(pg.status).json({ error: pg.message, details: isProd ? undefined : pg.details });

  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'Something went wrong on our side',
    details: isProd ? undefined : err.message,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}
