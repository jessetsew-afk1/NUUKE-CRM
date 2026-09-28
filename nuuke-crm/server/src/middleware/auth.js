import jwt from 'jsonwebtoken';
import { env, isProd } from '../env.js';
import { one } from '../db.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const COOKIE_NAME = 'nuuke_session';

export const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? 'strict' : 'lax',
  secure: isProd,
  path: '/',
  maxAge: 12 * 60 * 60 * 1000,
};

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, personId: user.person_id, clientId: user.client_id },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

/**
 * Reads the session cookie, then re-reads the user from the database on every
 * request. Slower than trusting the token alone, but it means deactivating an
 * account or changing someone's role takes effect immediately rather than
 * whenever their token happens to expire.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    if (!token) return next(unauthorized());

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return next(unauthorized('Your session has expired — please sign in again'));
    }

    const user = await one(
      `SELECT u.id, u.email, u.role, u.person_id, u.client_id, u.is_active,
              p.name AS person_name, p.department, p.role_title, p.capacity_hours,
              c.name AS client_name
         FROM users u
         LEFT JOIN people p  ON p.id = u.person_id
         LEFT JOIN clients c ON c.id = u.client_id
        WHERE u.id = $1`,
      [payload.sub]
    );

    if (!user || !user.is_active) return next(unauthorized('This account is no longer active'));

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Gate a route to specific roles. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(forbidden('Your role does not have access to this area'));
  }
  next();
};

/** Staff only — clients never reach the internal API surface. */
export const requireStaff = requireRole('ADMIN', 'MANAGER', 'MEMBER');
