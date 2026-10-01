/**
 * Admin-only account management: create a login, reset a password, switch a
 * login off or on, update someone's role.
 *
 * Creating a login needs Supabase's secret key, which must never reach the
 * browser — so this runs on Netlify. Every request carries the admin's own session
 * token, and the function checks that the caller really is an active admin before
 * doing anything.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'sales' | 'production' | 'client';

interface EmploymentInput {
  monthly_salary_pkr?: number;
  tracks_attendance?: boolean;
  shift_start?: string;
  shift_minutes?: number;
  work_days?: number[];
  daily_dial_target?: number;
  monthly_target_usd?: number;
  joined_on?: string | null;
}

type Body =
  | {
      action: 'create';
      email: string;
      password: string;
      full_name: string;
      role: Role;
      department?: string | null;
      title?: string | null;
      phone?: string | null;
      employment?: EmploymentInput;
    }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'update'; user_id: string; role?: Role; department?: string | null; title?: string | null; full_name?: string; email?: string };

const ROLES: Role[] = ['admin', 'sales', 'production', 'client'];

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function adminClient(): SupabaseClient {
  const clean = (v?: string) => v?.trim().replace(/^['"]+|['"]+$/g, '').trim() || undefined;
  const url = clean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
    ?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, '').replace(/\/+$/, '');
  const key = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in the Netlify environment');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Catches the usual Netlify mix-up: the publishable/anon key pasted where the secret one goes. */
function keyProblem(): string | null {
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim().replace(/^['"]+|['"]+$/g, '');
  if (key.startsWith('sb_secret_')) return null;
  if (key.startsWith('sb_publishable_')) {
    return 'SUPABASE_SECRET_KEY in Netlify holds the publishable key. Paste the secret key (it starts with sb_secret_) from Supabase → Project Settings → API Keys, then redeploy.';
  }
  const claims = key.split('.')[1];
  if (claims) {
    try {
      const role = JSON.parse(Buffer.from(claims, 'base64url').toString()).role;
      if (role && role !== 'service_role') {
        return `SUPABASE_SECRET_KEY in Netlify holds the "${role}" key. Use the secret (service_role) key from Supabase → Project Settings → API Keys, then redeploy.`;
      }
    } catch {
      /* not a JWT — let Supabase judge it */
    }
  }
  return null;
}

function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let db: SupabaseClient;
  try {
    db = adminClient();
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }

  const misconfigured = keyProblem();
  if (misconfigured) return json(500, { error: misconfigured });

  // Who is calling?
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Sign in first' });
  const { data: caller, error: callerErr } = await db.auth.getUser(token);
  if (callerErr || !caller.user) return json(401, { error: 'Your session has expired — sign in again' });
  const { data: callerProfile, error: profileErr } = await db
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (profileErr) return json(500, { error: `Could not read your profile: ${profileErr.message}` });
  if (!callerProfile) {
    return json(403, { error: 'Your login has no NUUKE profile in this database. Run select public.bootstrap_admin(...) in the Supabase SQL editor.' });
  }
  if (callerProfile.role !== 'admin' || !callerProfile.is_active) {
    return json(403, { error: 'Only an admin can manage logins' });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: 'Bad request' });
  }

  const audit = (action: string, entityId: string, summary: string) =>
    db.from('audit_log').insert({ actor_id: caller.user.id, action, entity: 'users', entity_id: entityId, summary });

  switch (body.action) {
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email' });
      if (fullName.length < 2) return json(400, { error: 'Enter their name' });
      if (!ROLES.includes(body.role)) return json(400, { error: 'Choose a role' });
      if (!validPassword(body.password)) return json(400, { error: 'The password needs at least 8 characters' });

      const { data: created, error } = await db.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !created.user) {
        const taken = /already/i.test(error?.message ?? '');
        return json(taken ? 409 : 400, { error: taken ? 'Someone already uses that email' : error?.message });
      }
      const id = created.user.id;

      const { error: profileErr } = await db.from('profiles').insert({
        id,
        email,
        full_name: fullName,
        role: body.role,
        department: body.department ?? null,
        title: body.title ?? null,
        phone: body.phone ?? null,
      });
      if (profileErr) {
        await db.auth.admin.deleteUser(id);
        return json(400, { error: profileErr.message });
      }

      if (body.role !== 'client') {
        const e = body.employment ?? {};
        const { error: empErr } = await db.from('employment').insert({
          profile_id: id,
          monthly_salary_pkr: e.monthly_salary_pkr ?? 0,
          tracks_attendance: e.tracks_attendance ?? body.role !== 'admin',
          shift_start: e.shift_start ?? '09:00',
          shift_minutes: e.shift_minutes ?? 540,
          work_days: e.work_days ?? [1, 2, 3, 4, 5],
          daily_dial_target: e.daily_dial_target ?? 250,
          monthly_target_usd: e.monthly_target_usd ?? 0,
          // Today in Pakistan, not in UTC (which is still yesterday until 5 am PKT).
          joined_on: e.joined_on ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
        });
        if (empErr) {
          await db.auth.admin.deleteUser(id);
          return json(400, { error: empErr.message });
        }
      }

      await audit('create', id, `Created a ${body.role} login for ${fullName} (${email})`);
      return json(201, { id });
    }

    case 'reset_password': {
      if (!validPassword(body.password)) return json(400, { error: 'The password needs at least 8 characters' });
      const { error } = await db.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return json(400, { error: error.message });
      await audit('reset_password', body.user_id, 'Reset a password');
      return json(200, { ok: true });
    }

    case 'set_active': {
      if (body.user_id === caller.user.id && !body.active) {
        return json(400, { error: 'You cannot switch off your own login' });
      }
      // Banning the auth user stops new sign-ins; is_active stops every request at once.
      const { error } = await db.auth.admin.updateUserById(body.user_id, {
        ban_duration: body.active ? 'none' : '876000h',
      });
      if (error) return json(400, { error: error.message });
      await db.from('profiles').update({ is_active: body.active }).eq('id', body.user_id);
      await audit(body.active ? 'activate' : 'deactivate', body.user_id, body.active ? 'Switched a login back on' : 'Switched a login off');
      return json(200, { ok: true });
    }

    case 'update': {
      const patch: Record<string, unknown> = {};
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return json(400, { error: 'Choose a role' });
        if (body.user_id === caller.user.id && body.role !== 'admin') {
          return json(400, { error: 'You cannot remove your own admin role' });
        }
        patch.role = body.role;
      }
      if (body.department !== undefined) patch.department = body.department;
      if (body.title !== undefined) patch.title = body.title;
      if (body.full_name !== undefined) patch.full_name = body.full_name.trim();
      if (body.email !== undefined) {
        const email = body.email.trim().toLowerCase();
        const { error } = await db.auth.admin.updateUserById(body.user_id, { email, email_confirm: true });
        if (error) return json(400, { error: error.message });
        patch.email = email;
      }
      if (Object.keys(patch).length) {
        const { error } = await db.from('profiles').update(patch).eq('id', body.user_id);
        if (error) return json(400, { error: error.message });
      }
      return json(200, { ok: true });
    }

    default:
      return json(400, { error: 'Unknown action' });
  }
};
