import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Pill } from '../components/Pill.jsx';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useCollection } from '../context/DataContext.jsx';
import { relativeTime } from '../lib/format.js';

const ROLE_COLOR = { ADMIN: '#BB3354', MANAGER: '#A25DDC', MEMBER: '#0086C0', CLIENT: '#00C875' };

const ROLE_HELP = {
  ADMIN: 'Everything, including these logins, invoicing and deletion.',
  MANAGER: 'Every operational and commercial board. No login management, no invoicing.',
  MEMBER: 'Delivery boards, and write access only to items assigned to them. No pipeline or billing.',
  CLIENT: 'Their own portal and nothing else.',
};

const schema = z
  .object({
    email: z.string().trim().min(1, 'Enter an email').email('That does not look like an email address'),
    password: z.string().min(10, 'Use at least 10 characters'),
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'CLIENT']),
    person_id: z.string().optional(),
    client_id: z.string().optional(),
  })
  .refine((v) => (v.role === 'CLIENT' ? Boolean(v.client_id) : true), {
    message: 'Pick the account this portal login belongs to',
    path: ['client_id'],
  })
  .refine((v) => (v.role !== 'CLIENT' ? Boolean(v.person_id) : true), {
    message: 'Link this login to a team member',
    path: ['person_id'],
  });

function NewUserForm({ onClose, onCreated }) {
  const { error } = useToast();
  const { rows: people } = useCollection('people');
  const { rows: clients } = useCollection('clients');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', role: 'MEMBER', person_id: '', client_id: '' },
  });
  const role = watch('role');

  const submit = async (values) => {
    try {
      const created = await api.post('/users', {
        email: values.email,
        password: values.password,
        role: values.role,
        person_id: values.role === 'CLIENT' ? null : Number(values.person_id),
        client_id: values.role === 'CLIENT' ? Number(values.client_id) : null,
      });
      onCreated(created);
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <Modal title="New login" hint="Set a starter password and ask them to change it on first sign-in." onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <div className="field">
          <label htmlFor="u-email">Email</label>
          <input id="u-email" className="input" aria-invalid={Boolean(errors.email)} {...register('email')} />
          {errors.email && <span className="err">{errors.email.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="u-password">Starter password</label>
          <input id="u-password" type="text" className="input" aria-invalid={Boolean(errors.password)} {...register('password')} />
          {errors.password && <span className="err">{errors.password.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" className="input" {...register('role')}>
            {Object.keys(ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'block', marginTop: 5 }}>{ROLE_HELP[role]}</span>
        </div>
        {role === 'CLIENT' ? (
          <div className="field">
            <label htmlFor="u-client">Account</label>
            <select id="u-client" className="input" {...register('client_id')}>
              <option value="">Choose an account…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.client_id && <span className="err">{errors.client_id.message}</span>}
          </div>
        ) : (
          <div className="field">
            <label htmlFor="u-person">Team member</label>
            <select id="u-person" className="input" {...register('person_id')}>
              <option value="">Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role_title}</option>)}
            </select>
            {errors.person_id && <span className="err">{errors.person_id.message}</span>}
          </div>
        )}
        <div className="modal-f">
          <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>Create login</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { openPanel } = useOutletContext();
  const { toast, error } = useToast();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => api.get('/users').then(setUsers).catch((err) => error(err.message));
  useEffect(() => { load(); }, []);

  const setRole = async (user, role) => {
    try {
      const updated = await api.patch(`/users/${user.id}`, { role });
      setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      toast(`${user.email} is now ${role}`);
    } catch (err) {
      error(err.message);
    }
  };

  const toggleActive = async (user) => {
    try {
      const updated = await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
      setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>Logins &amp; roles</h1>
            <p>Who can sign in, and what their role lets them reach. Owners only.</p>
          </div>
          <div className="bar-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Icon name="plus" />New login
            </button>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          {Object.entries(ROLE_HELP).map(([role, help]) => (
            <section className="card sp3" key={role}>
              <div className="card-h"><h3><Pill label={role} color={ROLE_COLOR[role]} /></h3></div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>{help}</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>
                {users.filter((u) => u.role === role).length} login{users.filter((u) => u.role === role).length === 1 ? '' : 's'}
              </p>
            </section>
          ))}

          <section className="card sp12">
            <div className="card-h"><h3>All logins</h3><span className="sub">{users.length} total</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-2)' }}>
                    <th style={{ padding: '8px 10px' }}>Email</th>
                    <th style={{ padding: '8px 10px' }}>Linked to</th>
                    <th style={{ padding: '8px 10px' }}>Role</th>
                    <th style={{ padding: '8px 10px' }}>Last signed in</th>
                    <th style={{ padding: '8px 10px' }}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--line-soft)', fontSize: 13 }}>
                      <td style={{ padding: '9px 10px' }}>{u.email}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-2)' }}>{u.person_name ?? u.client_name ?? '—'}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <select
                          className="input"
                          style={{ padding: '4px 8px', width: 'auto', fontSize: 12 }}
                          value={u.role}
                          onChange={(e) => setRole(u, e.target.value)}
                          aria-label={`Role for ${u.email}`}
                        >
                          {Object.keys(ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-3)', fontSize: 12 }}>
                        {u.last_login_at ? relativeTime(u.last_login_at) : 'never'}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <button type="button" className={`btn btn-sm${u.is_active ? ' on' : ''}`} onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {creating && (
        <NewUserForm
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); setUsers([]); load(); toast('Login created'); }}
        />
      )}
    </>
  );
}
