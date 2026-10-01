import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CircleCheck, CircleX, Info, PartyPopper } from 'lucide-react';
import clsx from 'clsx';

type ToastTone = 'info' | 'success' | 'warning' | 'danger' | 'celebrate';
export interface ToastInput {
  title: string;
  body?: string | null;
  tone?: ToastTone;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  duration?: number;
}
interface ToastItem extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

const ICON: Record<ToastTone, ReactNode> = {
  info: <Info className="size-5 text-info" />,
  success: <CircleCheck className="size-5 text-ok" />,
  warning: <AlertTriangle className="size-5 text-warn" />,
  danger: <CircleX className="size-5 text-bad" />,
  celebrate: <PartyPopper className="size-5 text-iris" />,
};

/** iOS-style banners that drop in from the top. Swipe up to dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setItems((xs) => [{ ...t, id }, ...xs].slice(0, 3));
    window.setTimeout(() => dismiss(id), t.duration ?? (t.tone === 'danger' ? 7000 : 4500));
  }, [dismiss]);
  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: -80, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -60, opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.6, bottom: 0.1 }}
              onDragEnd={(_, info) => { if (info.offset.y < -30) dismiss(t.id); }}
              className={clsx('glass-strong pointer-events-auto flex w-full max-w-[420px] cursor-grab items-start gap-3 rounded-[22px] px-4 py-3 active:cursor-grabbing')}
              role="status"
            >
              <div className="mt-0.5 shrink-0">{t.icon ?? ICON[t.tone ?? 'info']}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold leading-snug">{t.title}</div>
                {t.body && <div className="text-2 mt-0.5 text-[13px] leading-snug">{t.body}</div>}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="shrink-0 rounded-xl bg-[var(--btn)] px-3 py-1.5 text-xs font-bold text-[color:var(--btn-text)]"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
