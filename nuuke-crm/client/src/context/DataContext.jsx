import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const DataContext = createContext(null);

/**
 * A small shared cache over the board endpoints.
 *
 * Boards reference each other constantly (a ticket names a project, a project
 * names an account), so the whole reference set is loaded once and joined in
 * the browser rather than asking the API to join on every request. Writes
 * update the cache optimistically and roll back if the server refuses.
 */
const REFERENCE_SETS = ['people', 'clients', 'projects', 'sprints'];

export function DataProvider({ children }) {
  const { user, isStaff } = useAuth();
  const { error } = useToast();
  const [store, setStore] = useState({});
  const [loading, setLoading] = useState({});
  const inflight = useRef(new Map());

  const load = useCallback(
    async (name, { force = false } = {}) => {
      if (!isStaff) return [];
      if (!force && inflight.current.has(name)) return inflight.current.get(name);
      if (!force && store[name]) return store[name];

      setLoading((l) => ({ ...l, [name]: true }));
      const p = api
        .get(`/${name}`)
        .then((rows) => {
          setStore((s) => ({ ...s, [name]: rows }));
          return rows;
        })
        .catch((err) => {
          // A 403 here is by design (a member reaching a commercial board), not a fault.
          if (err.status !== 403) error(err.message);
          setStore((s) => ({ ...s, [name]: [] }));
          return [];
        })
        .finally(() => {
          setLoading((l) => ({ ...l, [name]: false }));
          inflight.current.delete(name);
        });

      inflight.current.set(name, p);
      return p;
    },
    [isStaff, store, error]
  );

  // The reference sets everything else joins against.
  useEffect(() => {
    if (!user || !isStaff) { setStore({}); return; }
    REFERENCE_SETS.forEach((name) => load(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable enough here
  }, [user, isStaff]);

  const collection = useCallback((name) => store[name] ?? [], [store]);

  const byId = useCallback(
    (name, id) => (id == null ? null : (store[name] ?? []).find((row) => row.id === id) ?? null),
    [store]
  );

  const nameOf = useCallback(
    (name, id) => {
      const row = byId(name, id);
      return row ? row.name ?? row.title ?? row.subject ?? row.number ?? '' : '';
    },
    [byId]
  );

  const update = useCallback(
    async (name, id, patch) => {
      const previous = store[name] ?? [];
      setStore((s) => ({
        ...s,
        [name]: (s[name] ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      }));
      try {
        const saved = await api.patch(`/${name}/${id}`, patch);
        setStore((s) => ({ ...s, [name]: (s[name] ?? []).map((row) => (row.id === id ? saved : row)) }));
        return saved;
      } catch (err) {
        setStore((s) => ({ ...s, [name]: previous }));
        error(err.message);
        throw err;
      }
    },
    [store, error]
  );

  const create = useCallback(
    async (name, body) => {
      const saved = await api.post(`/${name}`, body);
      setStore((s) => ({ ...s, [name]: [...(s[name] ?? []), saved] }));
      return saved;
    },
    []
  );

  const remove = useCallback(
    async (name, id) => {
      const previous = store[name] ?? [];
      setStore((s) => ({ ...s, [name]: (s[name] ?? []).filter((row) => row.id !== id) }));
      try {
        await api.delete(`/${name}/${id}`);
      } catch (err) {
        setStore((s) => ({ ...s, [name]: previous }));
        error(err.message);
        throw err;
      }
    },
    [store, error]
  );

  const value = useMemo(
    () => ({ store, loading, load, collection, byId, nameOf, update, create, remove }),
    [store, loading, load, collection, byId, nameOf, update, create, remove]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
};

/** Loads one collection on mount and returns its rows. */
export function useCollection(name) {
  const { collection, load, loading } = useData();
  useEffect(() => { if (name) load(name); }, [name, load]);
  return { rows: collection(name), loading: Boolean(loading[name]) };
}
