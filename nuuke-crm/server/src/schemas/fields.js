import { z } from 'zod';
import { labels } from '../domain/options.js';

/** An option from a named set in domain/options.js. */
export const option = (key) => z.enum(labels(key));
export const optionOrNull = (key) => option(key).nullable();

export const text = (max = 500) => z.string().trim().max(max);
export const requiredText = (max = 500) =>
  z.string().trim().min(1, 'This cannot be empty').max(max, `Keep this under ${max} characters`);

export const id = z.coerce.number().int().positive();
export const idOrNull = z.coerce.number().int().positive().nullable();

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-27');
export const dateOrNull = isoDate.nullable();

export const timestampOrNull = z.string().datetime({ offset: true }).nullable();

export const money = z.coerce.number().min(0, 'Cannot be negative').max(1_000_000_000).nullable();
export const percent = z.coerce.number().int().min(0).max(100).nullable();
export const points = z.coerce.number().int().min(0).max(100).nullable();
export const hoursField = z.coerce.number().min(0).max(1000).nullable();
export const count = z.coerce.number().int().min(0).max(1_000_000);
export const flag = z.boolean();

export const email = z.string().trim().toLowerCase().email('That does not look like an email address');
export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That is too long');

/**
 * Turns a create-schema into an update-schema: every field optional, but the
 * request must change at least one thing.
 */
export const asUpdate = (schema) =>
  schema.partial().refine((v) => Object.keys(v).length > 0, {
    message: 'Nothing to update',
  });
