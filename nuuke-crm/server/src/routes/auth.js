import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { one, query } from '../db.js';
import { loginSchema, changePasswordSchema } from '../schemas/index.js';
import { validateBody } from '../middleware/validate.js';
import { COOKIE_NAME, cookieOptions, signToken, requireAuth } from '../middleware/auth.js';
import { handler, unauthorized, badRequest } from '../lib/errors.js';

const router = express.Router();

// Slows down credential stuffing without getting in a real person's way.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait fifteen minutes and try again.' },
});

/** The shape the React app needs to decide what to render. */
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    person_id: u.person_id,
    client_id: u.client_id,
    name: u.person_name || u.client_name || u.email,
    department: u.department ?? null,
    role_title: u.role_title ?? null,
    capacity_hours: u.capacity_hours ?? null,
    client_name: u.client_name ?? null,
  };
}

router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  handler(async (req, res) => {
    const { email, password } = req.body;

    const user = await one(
      `SELECT u.*, p.name AS person_name, p.department, p.role_title, p.capacity_hours,
              c.name AS client_name
         FROM users u
         LEFT JOIN people p  ON p.id = u.person_id
         LEFT JOIN clients c ON c.id = u.client_id
        WHERE lower(u.email) = lower($1)`,
      [email]
    );

    // Same message and roughly the same timing whether the address exists or not.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) throw unauthorized('That email and password do not match');
    if (!user.is_active) throw unauthorized('This account has been deactivated');

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions);
    res.json({ data: publicUser(user) });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: publicUser(req.user) });
});

router.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  handler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) throw badRequest('Your current password is not right');
    if (currentPassword === newPassword) throw badRequest('Choose a password you have not used here before');

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await bcrypt.hash(newPassword, 12),
      req.user.id,
    ]);
    res.status(204).end();
  })
);

export default router;
export { publicUser };
