import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wordmark } from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('That does not look like an email address'),
  password: z.string().min(1, 'Enter your password'),
});

export default function LoginPage() {
  const { user, login, checking } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (!checking && user) {
    return <Navigate to={user.role === 'CLIENT' ? '/portal' : (location.state?.from?.pathname ?? '/')} replace />;
  }

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const me = await login(values);
      navigate(me.role === 'CLIENT' ? '/portal' : (location.state?.from?.pathname ?? '/'), { replace: true });
    } catch (err) {
      // Field-level messages from the API land next to the right input.
      if (err.fields) {
        Object.entries(err.fields).forEach(([field, message]) => {
          if (field in values) setError(field, { message });
        });
      }
      setFormError(err.message);
    }
  };

  return (
    <div className="login">
      <div className="login-brand">
        <Wordmark height={26} invert={false} />
        <div>
          <h1>Mission Control</h1>
          <p>
            Pipeline, sprints, squads, quality and client delivery in one place. Sign in with the
            address your studio account was set up with.
          </p>
        </div>
      </div>

      <div className="login-form">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <h2>Sign in</h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 20px' }}>
            Team members and client accounts use the same form — you land in the right place.
          </p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <span className="err">{errors.email.message}</span>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && <span className="err">{errors.password.message}</span>}
          </div>

          {formError && (
            <div
              role="alert"
              className="err"
              style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}
            >
              <Icon name="alert" size={14} />
              {formError}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="login-note">
            Seeded accounts: <b>aris@nuuke.studio</b> (owner), <b>maryam@nuuke.studio</b> (manager),
            <b> zoya@nuuke.studio</b> (team), <b>portal@halcyonhealth.co.uk</b> (client). The password
            is whatever you set as SEED_PASSWORD. Change all of them before this goes anywhere real.
          </p>
        </form>
      </div>
    </div>
  );
}
