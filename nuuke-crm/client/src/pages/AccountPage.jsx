import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api/client.js';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(10, 'Use at least 10 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'These do not match', path: ['confirm'] });

const ROLE_BLURB = {
  ADMIN: 'Owner — everything, including logins, billing and deletion.',
  MANAGER: 'Manager — every operational and commercial board, but not logins or invoicing.',
  MEMBER: 'Team — the delivery boards, and write access to the items assigned to you.',
  CLIENT: 'Client — your own portal only.',
};

export default function AccountPage() {
  const { openPanel } = useOutletContext();
  const { user, logout } = useAuth();
  const { toast, error } = useToast();
  const [done, setDone] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      reset();
      setDone(true);
      toast('Password changed');
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
            <h1>My account</h1>
            <p>Your role decides what you can see. Change your password here.</p>
          </div>
          <div className="bar-actions">
            <button type="button" className="btn btn-sm" onClick={logout}><Icon name="logout" />Sign out</button>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          <section className="card sp6">
            <div className="card-h"><h3>Signed in as</h3></div>
            <div className="fld"><label>Name</label><div className="fld-v">{user.name}</div></div>
            <div className="fld"><label>Email</label><div className="fld-v">{user.email}</div></div>
            <div className="fld"><label>Role</label><div className="fld-v">{user.role}</div></div>
            {user.role_title && <div className="fld"><label>Position</label><div className="fld-v">{user.role_title}</div></div>}
            {user.department && <div className="fld"><label>Squad</label><div className="fld-v">{user.department}</div></div>}
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '12px 0 0' }}>{ROLE_BLURB[user.role]}</p>
          </section>

          <section className="card sp6">
            <div className="card-h"><h3>Change password</h3><span className="sub">at least 10 characters</span></div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="field">
                <label htmlFor="currentPassword">Current password</label>
                <input id="currentPassword" type="password" autoComplete="current-password" className="input"
                  aria-invalid={Boolean(errors.currentPassword)} {...register('currentPassword')} />
                {errors.currentPassword && <span className="err">{errors.currentPassword.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="newPassword">New password</label>
                <input id="newPassword" type="password" autoComplete="new-password" className="input"
                  aria-invalid={Boolean(errors.newPassword)} {...register('newPassword')} />
                {errors.newPassword && <span className="err">{errors.newPassword.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm new password</label>
                <input id="confirm" type="password" autoComplete="new-password" className="input"
                  aria-invalid={Boolean(errors.confirm)} {...register('confirm')} />
                {errors.confirm && <span className="err">{errors.confirm.message}</span>}
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
                <Icon name="lock" />Update password
              </button>
              {done && <p style={{ color: 'var(--ok)', fontSize: 12.5, marginTop: 10 }}>Saved. Use the new password next time you sign in.</p>}
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
