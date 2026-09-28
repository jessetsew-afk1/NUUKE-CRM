import express from 'express';
import { rows, one, query } from '../db.js';
import { RESOURCES } from '../domain/resources.js';
import { createSchema, updateSchema, listQuerySchema } from '../schemas/index.js';
import { validateBody, validateQuery, requireIdParam } from '../middleware/validate.js';
import { forbidden, notFound, handler, badRequest } from './errors.js';
import { logActivity } from './activity.js';

/** Columns the API never lets a client set directly. */
const READ_ONLY = new Set(['id', 'created_at', 'updated_at', 'key', 'done_on']);

/**
 * Reads the real column list from Postgres once, so the generated SQL can never
 * drift from the schema and a renamed column fails loudly at boot.
 */
const columnCache = new Map();
async function writableColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const cols = await rows(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  if (!cols.length) throw new Error(`Table "${table}" does not exist — run npm run db:setup`);
  const list = cols.map((c) => c.column_name).filter((c) => !READ_ONLY.has(c));
  columnCache.set(table, list);
  return list;
}

function allowed(list, role) {
  return list.includes(role);
}

/**
 * A member may only change rows they own. Returns the row so callers do not
 * fetch it twice.
 */
async function assertMemberMayWrite(cfg, req, id) {
  const row = await one(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id]);
  if (!row) throw notFound('That item no longer exists');
  if (req.user.role !== 'MEMBER') return row;
  if (!cfg.memberOwn) throw forbidden('Only a manager can change this board');
  const owner = row[cfg.memberOwn];
  if (owner !== req.user.person_id) {
    throw forbidden('You can only change items assigned to you — ask a manager to reassign it');
  }
  return row;
}

/** Next key in a per-board sequence, e.g. NUK-1119. */
async function nextKey(cfg) {
  const { rows: r } = await query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(key, '\\D', '', 'g'), '')::int), 1000) AS n FROM ${cfg.table}`
  );
  return `${cfg.keyPrefix}-${r[0].n + 1}`;
}

export function crudRouter(name) {
  const cfg = RESOURCES[name];
  if (!cfg) throw new Error(`Unknown resource "${name}"`);
  const router = express.Router();

  // ---- list
  router.get(
    '/',
    validateQuery(listQuerySchema),
    handler(async (req, res) => {
      if (!allowed(cfg.read, req.user.role)) throw forbidden(`Your role cannot view ${name.replace('_', ' ')}`);
      const { limit, offset } = req.validatedQuery;
      const data = await rows(
        `SELECT * FROM ${cfg.table} ORDER BY ${cfg.order} LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json({ data });
    })
  );

  // ---- read one
  router.get(
    '/:id',
    requireIdParam,
    handler(async (req, res) => {
      if (!allowed(cfg.read, req.user.role)) throw forbidden(`Your role cannot view ${name.replace('_', ' ')}`);
      const row = await one(`SELECT * FROM ${cfg.table} WHERE id = $1`, [req.id]);
      if (!row) throw notFound();
      res.json({ data: row });
    })
  );

  // ---- create
  router.post(
    '/',
    validateBody(createSchema(name)),
    handler(async (req, res) => {
      const { role, person_id: personId } = req.user;
      const mayCreate = allowed(cfg.write, role) && (role !== 'MEMBER' || cfg.memberCreate);
      if (!mayCreate) throw forbidden(`Your role cannot add to ${name.replace('_', ' ')}`);

      const body = { ...req.body };
      // A member logging time or booking leave does it for themselves, full stop.
      if (role === 'MEMBER' && cfg.forcePerson) body[cfg.forcePerson] = personId;

      const cols = await writableColumns(cfg.table);
      const entries = Object.entries(body).filter(([k]) => cols.includes(k));
      if (!entries.length) throw badRequest('Nothing to save');

      if (cfg.keyPrefix) {
        entries.push(['key', await nextKey(cfg)]);
      }
      if (name === 'tasks' && body.status === 'Done') {
        entries.push(['done_on', new Date().toISOString().slice(0, 10)]);
      }

      const fields = entries.map(([k]) => k);
      const values = entries.map(([, v]) => v);
      const placeholders = fields.map((_, i) => `$${i + 1}`);

      const created = await one(
        `INSERT INTO ${cfg.table} (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );

      await logActivity(personId, `added “${created.title || created.name || created.subject || created.number}” to ${name.replace('_', ' ')}`, name, created.id);
      res.status(201).json({ data: created });
    })
  );

  // ---- update
  router.patch(
    '/:id',
    requireIdParam,
    validateBody(updateSchema(name)),
    handler(async (req, res) => {
      const { role, person_id: personId } = req.user;
      if (!allowed(cfg.write, role)) throw forbidden(`Your role cannot change ${name.replace('_', ' ')}`);

      const before = await assertMemberMayWrite(cfg, req, req.id);

      const body = { ...req.body };
      // Members cannot hand their own rows to someone else, or reassign a row to themselves.
      if (role === 'MEMBER' && cfg.forcePerson) delete body[cfg.forcePerson];

      const cols = await writableColumns(cfg.table);
      const entries = Object.entries(body).filter(([k]) => cols.includes(k));
      if (!entries.length) throw badRequest('Nothing to update');

      // Moving a ticket to Done stamps the day it finished, which the burndown reads.
      if (name === 'tasks' && body.status) {
        entries.push(['done_on', body.status === 'Done' ? new Date().toISOString().slice(0, 10) : null]);
      }

      const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
      const values = entries.map(([, v]) => v);

      const updated = await one(
        `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = $${values.length + 1} RETURNING *`,
        [...values, req.id]
      );

      const label = updated.title || updated.name || updated.subject || updated.number || `#${updated.id}`;
      if (body.status && body.status !== before.status) {
        await logActivity(personId, `moved “${label}” to ${body.status}`, name, updated.id);
      } else if (body.assignee_id && body.assignee_id !== before.assignee_id) {
        await logActivity(personId, `reassigned “${label}”`, name, updated.id);
      }

      res.json({ data: updated });
    })
  );

  // ---- delete
  router.delete(
    '/:id',
    requireIdParam,
    handler(async (req, res) => {
      const { role, person_id: personId } = req.user;
      if (!allowed(cfg.remove, role)) throw forbidden('Your role cannot delete from this board');
      const row = await assertMemberMayWrite(cfg, req, req.id);
      await query(`DELETE FROM ${cfg.table} WHERE id = $1`, [req.id]);
      await logActivity(personId, `deleted “${row.title || row.name || row.subject || row.number}”`, name, req.id);
      res.status(204).end();
    })
  );

  return router;
}
