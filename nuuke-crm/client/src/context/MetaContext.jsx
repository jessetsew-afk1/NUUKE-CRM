import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const MetaContext = createContext(null);

/**
 * Option lists and per-role permissions, fetched once after sign-in. Keeping
 * these server-side means a new status or a permission change needs no client
 * release, and the UI can never offer a value the API would reject.
 */
export function MetaProvider({ children }) {
  const { user, isStaff } = useAuth();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    if (!user || !isStaff) { setMeta(null); return undefined; }
    let cancelled = false;
    api.get('/meta').then((m) => { if (!cancelled) setMeta(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, isStaff]);

  const value = useMemo(() => {
    const options = meta?.options ?? {};
    return {
      meta,
      ready: Boolean(meta),
      options,
      /** Labels for an option set, e.g. optionList('taskStatus'). */
      optionList: (key) => (options[key] ?? []).map(([label]) => label),
      /** The colour for one value in a set. */
      optionColor: (key, value) => (options[key] ?? []).find(([label]) => label === value)?.[1] ?? '#C3C6D4',
      can: (resource, action) => Boolean(meta?.permissions?.[resource]?.[action]),
      ownField: (resource) => meta?.permissions?.[resource]?.ownField ?? null,
      ownOnly: (resource) => Boolean(meta?.permissions?.[resource]?.ownOnly),
    };
  }, [meta]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export const useMeta = () => {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error('useMeta must be used inside MetaProvider');
  return ctx;
};
