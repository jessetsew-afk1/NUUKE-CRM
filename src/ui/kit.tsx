/**
 * The NUUKE UI kit — small, glassy, springy. Every control presses in a little
 * (iOS-style) and every surface is frosted glass over the aurora.
 */
import {
  forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';

export const spring = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring = { type: 'spring' as const, stiffness: 260, damping: 30 };

/* ================================================================== Button */
type Variant = 'primary' | 'glass' | 'ghost' | 'iris' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--btn)] text-[color:var(--btn-text)] shadow-[0_6px_20px_-6px_rgba(11,11,16,0.45)] hover:brightness-110',
  glass: 'glass hover:bg-[var(--glass-strong)]',
  ghost: 'hover:bg-[var(--fill)] text-[color:var(--text)]',
  iris: 'bg-iris text-white shadow-[0_8px_24px_-8px_rgba(124,92,255,0.75)] hover:brightness-110',
  danger: 'bg-bad text-white shadow-[0_8px_24px_-10px_rgba(255,69,58,0.7)] hover:brightness-105',
  success: 'bg-ok text-white shadow-[0_8px_24px_-10px_rgba(48,196,108,0.7)] hover:brightness-105',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-10 px-4 text-sm gap-2 rounded-[14px]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  xl: 'h-16 px-8 text-lg gap-3 rounded-[22px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', loading, icon, iconRight, children, className, disabled, block, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={spring}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[filter,background,opacity] duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant], sizes[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </motion.button>
  );
});

export function IconButton({
  label, children, className, active, badge, ...rest
}: { label: string; children: ReactNode; active?: boolean; badge?: number | boolean } & HTMLMotionProps<'button'>) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={spring}
      aria-label={label}
      title={label}
      className={clsx(
        'relative grid size-10 shrink-0 place-items-center rounded-[14px] transition-colors',
        active ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'hover:bg-[var(--fill-2)]',
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring}
          className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-[var(--canvas)]"
        >
          {typeof badge === 'number' ? (badge > 99 ? '99+' : badge) : ''}
        </motion.span>
      ) : null}
    </motion.button>
  );
}

/* =================================================================== Panel */
export function Panel({
  children, className, strong, padded = true, as: Tag = 'section', ...rest
}: { children: ReactNode; className?: string; strong?: boolean; padded?: boolean; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={clsx(strong ? 'glass-strong' : 'glass', 'rounded-[var(--radius-glass)]', padded && 'p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold">{title}</h3>
        {sub && <p className="text-2 mt-0.5 text-[13px]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ================================================================== Fields */
export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="label flex items-center justify-between">
      <span>{children}</span>
      {hint && <span className="text-3 font-medium">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string | null; leading?: ReactNode }>(
  function Input({ label, hint, error, leading, className, id, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <div className={className}>
        {label && <Label htmlFor={fid} hint={hint}>{label}</Label>}
        <div className="relative">
          {leading && <span className="text-3 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{leading}</span>}
          <input ref={ref} id={fid} className={clsx('field', leading && 'pl-10', error && 'border-bad/60')} {...rest} />
        </div>
        {error && <p className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }>(
  function Textarea({ label, hint, className, id, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <div className={className}>
        {label && <Label htmlFor={fid} hint={hint}>{label}</Label>}
        <textarea ref={ref} id={fid} className="field" {...rest} />
      </div>
    );
  },
);

/* ================================================================== Picker */
export interface PickerOption<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
  dot?: string;
  icon?: ReactNode;
  group?: string;
}

/**
 * A glass dropdown. Keyboard: ↑ ↓ to move, Enter to choose, Esc to close, or type
 * the first letters of an option.
 */
export function Picker<V extends string = string>({
  value, onChange, options, placeholder = 'Choose…', label, className, size = 'md', disabled, align = 'left', menuClassName,
}: {
  value: V | null | undefined;
  onChange: (v: V) => void;
  options: PickerOption<V>[];
  placeholder?: string;
  label?: ReactNode;
  className?: string;
  size?: 'md' | 'lg';
  disabled?: boolean;
  align?: 'left' | 'right';
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const selected = options.find((o) => o.value === value);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, options, value]);

  const choose = (o: PickerOption<V>) => { onChange(o.value); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && ['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current.text = now - typed.current.at > 700 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase();
      typed.current.at = now;
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={root} className={clsx('relative', className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx('field flex items-center gap-2 text-left disabled:opacity-50', size === 'lg' && 'h-12 text-[15px]')}
      >
        {selected?.dot && <span className="size-2.5 shrink-0 rounded-full" style={{ background: selected.dot }} />}
        {selected?.icon}
        <span className={clsx('min-w-0 flex-1 truncate', !selected && 'text-3')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={clsx('size-4 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className={clsx(
              'glass-strong scroll-y absolute z-50 mt-2 max-h-80 min-w-full overflow-auto rounded-2xl p-1.5',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              menuClassName,
            )}
          >
            {options.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.value}>
                  {header && <div className="text-3 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm',
                      i === active && 'bg-[var(--fill-2)]',
                    )}
                  >
                    {o.dot && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.dot }} />}
                    {o.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.label}</span>
                      {o.hint && <span className="text-3 block truncate text-xs">{o.hint}</span>}
                    </span>
                    {o.value === value && <Check className="size-4 text-iris" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =============================================================== Segmented */
export function Segmented<V extends string>({
  value, onChange, options, className, size = 'md',
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={clsx('fill inline-flex rounded-[14px] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative rounded-[11px] font-semibold transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
            o.value === value ? 'text-[color:var(--text)]' : 'text-2 hover:text-[color:var(--text)]',
          )}
        >
          {o.value === value && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={spring}
              className="absolute inset-0 rounded-[11px] bg-[var(--glass-strong)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* =================================================================== Chips */
export function Chip({
  active, children, onClick, dot, count, className,
}: { active?: boolean; children: ReactNode; onClick?: () => void; dot?: string; count?: number; className?: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={spring}
      onClick={onClick}
      aria-pressed={active}
      title={typeof children === 'string' && children.length > 32 ? children : undefined}
      className={clsx(
        'inline-flex h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]',
        className,
      )}
    >
      {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 max-w-[240px] truncate">{children}</span>
      {count !== undefined && (
        <span className={clsx('tabular shrink-0 rounded-full px-1.5 text-[11px]', active ? 'bg-white/20' : 'bg-[var(--fill-2)]')}>{count}</span>
      )}
    </motion.button>
  );
}

export type Tone = 'neutral' | 'info' | 'good' | 'great' | 'warn' | 'bad' | 'iris';
export const toneColor: Record<Tone, string> = {
  neutral: '#8E8AA0', info: '#0A84FF', good: '#30C46C', great: '#7C5CFF', warn: '#FF9F0A', bad: '#FF453A', iris: '#7C5CFF',
};

export function Pill({ tone = 'neutral', children, className, solid }: { tone?: Tone; children: ReactNode; className?: string; solid?: boolean }) {
  const c = toneColor[tone];
  return (
    <span
      className={clsx('inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold', className)}
      style={solid ? { background: c, color: '#fff' } : { background: `${c}1F`, color: c }}
      title={typeof children === 'string' && children.length > 32 ? children : undefined}
    >
      {!solid && <span className="size-1.5 shrink-0 rounded-full" style={{ background: c }} />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/* =================================================================== Sheet */
/**
 * A modal that is a centred card on desktop and a bottom sheet on phones. Pass
 * `layoutId` to have it grow out of the element that opened it (iOS App Store style).
 */
export function Sheet({
  open, onClose, children, title, width = 560, layoutId, footer, className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  width?: number;
  layoutId?: string;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            layoutId={layoutId}
            role="dialog"
            aria-modal="true"
            initial={layoutId ? undefined : { y: 40, opacity: 0, scale: 0.98 }}
            animate={layoutId ? undefined : { y: 0, opacity: 1, scale: 1 }}
            exit={layoutId ? undefined : { y: 30, opacity: 0, scale: 0.98 }}
            transition={softSpring}
            style={{ maxWidth: width }}
            className={clsx(
              'glass-strong relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[30px] sm:rounded-[30px]',
              className,
            )}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[var(--fill-2)] sm:hidden" />
            {title && (
              <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
                <h2 className="text-lg font-extrabold">{title}</h2>
                <IconButton label="Close" onClick={onClose} className="-mr-2"><X className="size-5" /></IconButton>
              </div>
            )}
            <div className="scroll-y min-h-0 flex-1 px-6 pb-6 pt-2">{children}</div>
            {footer && <div className="hairline flex items-center justify-end gap-2 border-t px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ================================================================ Progress */
export function ProgressBar({
  value, max = 100, className, height = 10, tone, glow = true,
}: { value: number; max?: number; className?: string; height?: number; tone?: string; glow?: boolean }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  const done = p >= 1;
  return (
    <div className={clsx('fill relative overflow-hidden rounded-full', className)} style={{ height }}>
      <motion.div
        className={clsx('absolute inset-y-0 left-0 rounded-full', glow && 'sheen')}
        initial={false}
        animate={{ width: `${p * 100}%` }}
        transition={softSpring}
        style={{
          background: tone ?? (done ? 'linear-gradient(90deg,#30C46C,#34D3A0)' : 'linear-gradient(90deg,#7C5CFF,#5AB8FF)'),
          boxShadow: glow ? `0 0 16px ${done ? 'rgba(48,196,108,.55)' : 'rgba(124,92,255,.55)'}` : undefined,
        }}
      />
    </div>
  );
}

export function Ring({
  value, max = 100, size = 120, stroke = 12, children, color,
}: { value: number; max?: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  const gid = useId().replace(/:/g, '');
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color ?? '#7C5CFF'} />
            <stop offset="1" stopColor={color ?? '#5AB8FF'} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#ring-${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={softSpring}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ==================================================================== Misc */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-iris', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="fill-2 inline-grid min-w-[20px] place-items-center rounded-md px-1.5 font-mono text-[11px] font-semibold leading-5">
      {children}
    </kbd>
  );
}

export function Stat({
  label, value, sub, icon, accent, className,
}: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string; className?: string }) {
  return (
    <Panel className={clsx('relative overflow-hidden', className)}>
      {accent && <div className="absolute -right-8 -top-8 size-28 rounded-full opacity-25 blur-2xl" style={{ background: accent }} />}
      <div className="text-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide">
        {icon && <span className="grid size-7 place-items-center rounded-xl" style={{ background: `${accent ?? '#7C5CFF'}22`, color: accent ?? '#7C5CFF' }}>{icon}</span>}
        {label}
      </div>
      <div className="tabular mt-3 font-display text-[30px] font-extrabold leading-none tracking-tight">{value}</div>
      {sub && <div className="text-2 mt-2 text-[13px]">{sub}</div>}
    </Panel>
  );
}

export function PageHeader({
  title, sub, right, eyebrow,
}: { title: ReactNode; sub?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-iris">{eyebrow}</div>}
        <h1 className="text-[30px] font-extrabold leading-tight sm:text-[34px]">{title}</h1>
        {sub && <p className="text-2 mt-1 max-w-2xl text-[14px]">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Empty({ title, body, art, action }: { title: ReactNode; body?: ReactNode; art?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {art}
      <h3 className="mt-4 text-lg font-extrabold">{title}</h3>
      {body && <p className="text-2 mt-1 max-w-sm text-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-[30px] w-[50px] rounded-full transition-colors duration-300', checked ? 'bg-ok' : 'bg-[var(--fill-2)]')}
      >
        <motion.span
          layout
          transition={spring}
          className="absolute top-[3px] size-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
          style={{ left: checked ? 23 : 3 }}
        />
      </button>
      {label}
    </label>
  );
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside, active]);
  return ref;
}

export type { ButtonHTMLAttributes };
