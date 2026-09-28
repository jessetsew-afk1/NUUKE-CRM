import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/me')
      .then((me) => { if (!cancelled) setUser(me); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (credentials) => {
    const me = await api.post('/auth/login', credentials);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      login,
      logout,
      isStaff: user ? user.role !== 'CLIENT' : false,
      isAdmin: user?.role === 'ADMIN',
      isManager: user ? ['ADMIN', 'MANAGER'].includes(user.role) : false,
      isMember: user?.role === 'MEMBER',
      isClient: user?.role === 'CLIENT',
    }),
    [user, checking, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
