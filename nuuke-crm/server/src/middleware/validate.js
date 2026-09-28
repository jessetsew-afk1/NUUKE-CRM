import { badRequest } from '../lib/errors.js';

/**
 * Validates req.body against a Zod schema and replaces it with the parsed value,
 * so routes only ever see data that has been through the schema.
 */
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return next(result.error);
  req.validatedQuery = result.data;
  next();
};

/** Route params are always strings; this turns :id into a positive integer or rejects. */
export const requireIdParam = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return next(badRequest('That id is not valid'));
  req.id = id;
  next();
};
