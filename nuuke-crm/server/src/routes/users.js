import express from 'express';
import bcrypt from 'bcryptjs';
import { rows, one, query } from '../db.js';
import { userCreateSchema, userUpdateSchema } from '../schemas/index.js';
import { validateBody, requireIdParam } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { handler, notFound, badRequest, conflict } from '../lib/errors.js';

const router = express.Router();

// Managing logins is the one thing only an owner does.
router.use(requireRole('ADMIN'));

router.get(
  '/',
  handler(async (req, res) => {
    const data = await rows(
      `SELECT u.id, u.email, u.role, u.person_id, u.client_id, u.is_active,
              u.last_login_at, u.created_at,
              p.name AS person_name, c.name AS client_name
         FROM users u
         LEFT JOIN people p  ON p.id = u.person_id
         LEFT JOIN clients c ON c.id = u.client_id
        ORDER BY u.role, lower(u.email)`
    );
    res.json({ data });
  })
);

router.post(
  '/',
  validateBody(userCreateSchema),
  handler(async (req, res) => {
    const { email, password, role, person_id, client_id, is_active } = req.body;

    const existing = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing) throw conflict('There is already a login with that email address');

    const created = await one(
      `INSERT INTO users (email, password_hash, role, person_id, client_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, email, role, person_id, client_id, is_active, created_at`,
      [email, await bcrypt.hash(password, 12), role, person_id, client_id, is_active]
    );
    res.status(201).json({ data: created });
  })
);

router.patch(
  '/:id',
  requireIdParam,
  validateBody(userUpdateSchema),
  handler(async (req, res) => {
    const target = await one('SELECT * FROM users WHERE id = $1', [req.id]);
    if (!target) throw notFound('That login does not exist');

    // Guard rails: never lock the last owner out of the system.
    if (target.role === 'ADMIN' && (req.body.role && req.body.role !== 'ADMIN' || req.body.is_active === false)) {
      const { count } = await one(
        `SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = TRUE AND id <> $1`,
        [req.id]
      );
      if (count === 0) throw badRequest('This is the last active owner — promote someone else first');
    }
    if (target.id === req.user.id && req.body.is_active === false) {
      throw badRequest('You cannot deactivate your own login');
    }

    const patch = { ...req.body };
    if (patch.password) {
      patch.password_hash = await bcrypt.hash(patch.password, 12);
      delete patch.password;
    }

    const fields = Object.keys(patch);
    if (!fields.length) throw badRequest('Nothing to update');
    const sets = fields.map((f, i) => `${f} = $${i + 1}`);

    const updated = await one(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${fields.length + 1}
       RETURNING id, email, role, person_id, client_id, is_active, last_login_at, created_at`,
      [...fields.map((f) => patch[f]), req.id]
    );
    res.json({ data: updated });
  })
);

router.delete(
  '/:id',
  requireIdParam,
  handler(async (req, res) => {
    if (req.id === req.user.id) throw badRequest('You cannot delete your own login');
    const target = await one('SELECT role FROM users WHERE id = $1', [req.id]);
    if (!target) throw notFound('That login does not exist');
    if (target.role === 'ADMIN') {
      const { count } = await one(
        `SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND id <> $1`, [req.id]
      );
      if (count === 0) throw badRequest('That is the last owner login');
    }
    await query('DELETE FROM users WHERE id = $1', [req.id]);
    res.status(204).end();
  })
);

export default router;
