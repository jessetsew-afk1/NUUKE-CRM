import pg from 'pg';
import { env } from './env.js';

// Postgres returns DATE columns as JS Date objects in the server's timezone, which
// shifts them by a day either side of UTC. Every date in this app is a calendar day,
// so hand them back as plain YYYY-MM-DD strings instead.
pg.types.setTypeParser(1082, (value) => value);
// NUMERIC -> Number. Every numeric column here is money or hours, well inside float range.
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
// INT8 -> Number, so count(*) comes back as a number rather than a string.
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on an idle Postgres client', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function rows(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function one(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
