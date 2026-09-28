import express from 'express';
import { rows, one, query } from '../db.js';
import { RESOURCES } from '../domain/resources.js';
import { updateBodySchema, subtaskCreateSchema, subtaskUpdateSchema } from '../schemas/index.js';
import { validateBody, requireIdParam } from '../middleware/validate.js';
import { handler, forbidden, notFound, badRequest } from '../lib/errors.js';
import { logActivity } from '../lib/activity.js';

/**
 * Comment threads and checklists. One router serves every board that declares
 * `comments` or `subtasks`, mounted at /api/:resource/:id/updates|subtasks.
 *
 * Anyone who can read a board can comment on it — holding an engineer back from
 * replying on a ticket they can see would make the tool worse, not safer.
 */
const router = express.Router({ mergeParams: true });

function config(req) {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) throw notFound('Unknown board');
  if (!cfg.read.includes(req.user.role)) throw forbidden('Your role cannot view this board');
  return cfg;
}

async function assertExists(cfg, id) {
  const row = await one(`SELECT id FROM ${cfg.table} WHERE id = $1`, [id]);
  if (!row) throw notFound('That item no longer exists');
}

// ---------------------------------------------------------------- updates
router.get(
  '/:id/updates',
  requireIdParam,
  handler(async (req, res) => {
    const cfg = config(req);
    if (!cfg.comments) throw badRequest('This board does not have comments');
    const data = await rows(
      `SELECT u.id, u.body, u.created_at, u.author_id, p.name AS author_name
         FROM updates u LEFT JOIN people p ON p.id = u.author_id
        WHERE u.entity_type = $1 AND u.entity_id = $2
        ORDER BY u.created_at DESC`,
      [req.params.resource, req.id]
    );
    res.json({ data });
  })
);

router.post(
  '/:id/updates',
  requireIdParam,
  validateBody(updateBodySchema),
  handler(async (req, res) => {
    const cfg = config(req);
    if (!cfg.comments) throw badRequest('This board does not have comments');
    await assertExists(cfg, req.id);

    const created = await one(
      `INSERT INTO updates (entity_type, entity_id, author_id, body)
       VALUES ($1,$2,$3,$4) RETURNING id, body, created_at, author_id`,
      [req.params.resource, req.id, req.user.person_id, req.body.body]
    );

    const parent = await one(`SELECT * FROM ${cfg.table} WHERE id = $1`, [req.id]);
    await logActivity(
      req.user.person_id,
      `posted an update on “${parent.title || parent.name || parent.subject}”`,
      req.params.resource,
      req.id
    );

    res.status(201).json({ data: { ...created, author_name: req.user.person_name } });
  })
);

router.delete(
  '/:id/updates/:updateId',
  requireIdParam,
  handler(async (req, res) => {
    config(req);
    const updateId = Number(req.params.updateId);
    const row = await one('SELECT author_id FROM updates WHERE id = $1', [updateId]);
    if (!row) throw notFound('That update has already gone');
    const isOwn = row.author_id === req.user.person_id;
    if (!isOwn && !['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw forbidden('You can only delete your own updates');
    }
    await query('DELETE FROM updates WHERE id = $1', [updateId]);
    res.status(204).end();
  })
);

// ---------------------------------------------------------------- subtasks
router.get(
  '/:id/subtasks',
  requireIdParam,
  handler(async (req, res) => {
    const cfg = config(req);
    if (!cfg.subtasks) throw badRequest('This board does not have checklists');
    const data = await rows(
      `SELECT id, text, done, position FROM subtasks WHERE task_id = $1 ORDER BY position, id`,
      [req.id]
    );
    res.json({ data });
  })
);

router.post(
  '/:id/subtasks',
  requireIdParam,
  validateBody(subtaskCreateSchema),
  handler(async (req, res) => {
    const cfg = config(req);
    if (!cfg.subtasks) throw badRequest('This board does not have checklists');
    await assertExists(cfg, req.id);
    const { max } = await one('SELECT COALESCE(MAX(position), -1) AS max FROM subtasks WHERE task_id = $1', [req.id]);
    const created = await one(
      `INSERT INTO subtasks (task_id, text, position) VALUES ($1,$2,$3)
       RETURNING id, text, done, position`,
      [req.id, req.body.text, Number(max) + 1]
    );
    res.status(201).json({ data: created });
  })
);

router.patch(
  '/:id/subtasks/:subtaskId',
  requireIdParam,
  validateBody(subtaskUpdateSchema),
  handler(async (req, res) => {
    config(req);
    const subtaskId = Number(req.params.subtaskId);
    const fields = Object.keys(req.body);
    if (!fields.length) throw badRequest('Nothing to update');
    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const updated = await one(
      `UPDATE subtasks SET ${sets.join(', ')} WHERE id = $${fields.length + 1} AND task_id = $${fields.length + 2}
       RETURNING id, text, done, position`,
      [...fields.map((f) => req.body[f]), subtaskId, req.id]
    );
    if (!updated) throw notFound('That checklist item has gone');
    res.json({ data: updated });
  })
);

router.delete(
  '/:id/subtasks/:subtaskId',
  requireIdParam,
  handler(async (req, res) => {
    config(req);
    await query('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [Number(req.params.subtaskId), req.id]);
    res.status(204).end();
  })
);

export default router;
