import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Wordmark } from './Logo.jsx';

function Booting() {
  return (
    <div className="empty" style={{ height: '100%' }}>
      <Wordmark height={26} />
      <p>Loading your workspace…</p>
    </div>
  );
}

/**
 * Route guard. `roles` narrows a route to specific parties; a signed-in user who
 * does not qualify is sent to their own home rather than shown an error.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) return <Booting />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'CLIENT' ? '/portal' : '/'} replace />;
  }
  return children;
}
