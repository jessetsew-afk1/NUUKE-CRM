import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Sparkles } from 'lucide-react';

/**
 * Keeping the app alive.
 *
 * 1. After a new version is published, a tab that has been open a while still runs the
 *    old version and asks for page files that no longer exist. Instead of a blank screen
 *    we reload once, quietly, onto the new version.
 * 2. Any other crash shows a friendly card with "Try again" instead of a white page.
 * 3. We check for a new version now and then, and offer a one-tap refresh.
 */

const RELOAD_KEY = 'nuuke-reloaded-at';

export function isStaleBuildError(err: unknown) {
  const msg = String((err as Error)?.message ?? err ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Expected a JavaScript module|ChunkLoadError|Unable to preload CSS|module script.*MIME/i.test(msg);
}

/** Reload, but never more than once a minute (so a real outage can't cause a loop). */
export function reloadOnce() {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* private mode */ }
  if (Date.now() - last < 60_000) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
  return true;
}

export class ErrorBoundary extends Component<{ children: ReactNode; full?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NUUKE caught an error', error, info.componentStack);
    if (isStaleBuildError(error)) reloadOnce();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleBuildError(error);
    return (
      <div className={this.props.full ? 'grid min-h-dvh place-items-center p-4' : 'grid place-items-center py-16'}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-strong w-full max-w-[440px] rounded-[30px] p-8 text-center">
          <Sparkles className="mx-auto size-10 text-iris" />
          <h2 className="mt-3 text-[22px] font-extrabold">{stale ? 'NUUKE was just updated' : 'That page tripped over'}</h2>
          <p className="text-2 mt-1 text-[14px]">
            {stale ? 'Refresh to load the newest version — it only takes a second.' : 'Nothing you did is lost. Try again, or refresh the page.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {!stale && (
              <button type="button" onClick={() => this.setState({ error: null })} className="glass h-11 rounded-2xl px-5 text-[14px] font-bold">
                Try again
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()}
              className="flex h-11 items-center gap-2 rounded-2xl bg-[var(--btn)] px-5 text-[14px] font-bold text-[color:var(--btn-text)]">
              <RefreshCw className="size-4" /> Refresh
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
}

/** The script this tab is running, e.g. "/assets/index-D5ar4_GU.js". */
function currentBuild() {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return el ? new URL(el.src).pathname : null;
}

async function latestBuild() {
  const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

/** A small banner when a newer version of NUUKE has been published. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = currentBuild();
    if (!mine || import.meta.env.DEV) return;
    let stop = false;
    const check = async () => {
      if (stop || document.hidden) return;
      try {
        const latest = await latestBuild();
        if (latest && latest !== mine) setStale(true);
      } catch { /* offline — try again later */ }
    };
    const t = window.setInterval(check, 5 * 60_000);
    const onShow = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; window.clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  if (!stale) return null;
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 lg:bottom-6">
      <button type="button" onClick={() => window.location.reload()}
        className="glass-strong flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-[13px] font-semibold shadow-xl">
        <Sparkles className="size-4 text-iris" />
        A new version of NUUKE is ready
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--btn)] px-3 py-1.5 font-bold text-[color:var(--btn-text)]">
          <RefreshCw className="size-3.5" /> Refresh
        </span>
      </button>
    </motion.div>
  );
}
