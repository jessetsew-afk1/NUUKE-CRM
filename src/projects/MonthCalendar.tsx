import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, IconButton, Sheet } from '@/ui/kit';

export interface CalItem {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  title: string;
  color: string;
  kind: string;
  time?: string | null;
  sub?: string | null;
  icon?: ReactNode;
  onClick?: () => void;
  faded?: boolean;
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * A glass month view. Phones get an agenda (the next weeks as a list) instead of
 * cells too small to read. Tap a day to see everything on it, or add to it.
 */
export function MonthCalendar({
  items, onAdd, addLabel = 'Add', legend,
}: { items: CalItem[]; onAdd?: (day: string) => void; addLabel?: string; legend?: { label: string; color: string }[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dir, setDir] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    for (const list of m.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    return m;
  }, [items]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const go = (n: number) => { setDir(n); setMonth((m) => addMonths(m, n)); };
  const openItems = open ? byDay.get(open) ?? [] : [];

  // The agenda: this month's days that have something on them.
  const agenda = days.filter((d) => isSameMonth(d, month) && byDay.has(iso(d)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-[20px] font-extrabold">{format(month, 'MMMM yyyy')}</h3>
        <Button size="sm" variant="glass" onClick={() => { setDir(0); setMonth(startOfMonth(new Date())); }}>Today</Button>
        <IconButton label="Previous month" onClick={() => go(-1)}><ChevronLeft className="size-5" /></IconButton>
        <IconButton label="Next month" onClick={() => go(1)}><ChevronRight className="size-5" /></IconButton>
      </div>

      {/* month grid (tablet and up) */}
      <div className="hidden sm:block">
        <div className="text-3 mb-2 grid grid-cols-7 gap-2 px-1 text-[11px] font-bold uppercase tracking-wider">
          {WEEK.map((d) => <div key={d}>{d}</div>)}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={iso(month)}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="grid grid-cols-7 gap-2"
          >
            {days.map((d) => {
              const key = iso(d);
              const list = byDay.get(key) ?? [];
              const inMonth = isSameMonth(d, month);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpen(key)}
                  className={clsx(
                    'group flex min-h-[112px] flex-col rounded-[18px] p-2 text-left transition-colors',
                    inMonth ? 'fill hover:bg-[var(--fill-2)]' : 'opacity-40',
                    isToday(d) && 'ring-2 ring-iris',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={clsx('grid size-7 place-items-center rounded-full text-[13px] font-bold', isToday(d) && 'bg-iris text-white')}>
                      {format(d, 'd')}
                    </span>
                    {onAdd && <Plus className="text-3 size-4 opacity-0 transition-opacity group-hover:opacity-100" />}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((it) => (
                      <div key={it.id} className={clsx('flex items-center gap-1.5 truncate rounded-lg px-1.5 py-0.5 text-[11.5px] font-semibold', it.faded && 'line-through opacity-60')}
                        style={{ background: `${it.color}24`, color: 'var(--text)' }}>
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: it.color }} />
                        <span className="truncate">{it.title}</span>
                      </div>
                    ))}
                    {list.length > 3 && <div className="text-3 px-1.5 text-[11px] font-bold">+{list.length - 3} more</div>}
                  </div>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
        {legend && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {legend.map((l) => (
              <span key={l.label} className="text-2 flex items-center gap-1.5 text-[12px] font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />{l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* agenda (phones) */}
      <div className="space-y-3 sm:hidden">
        {agenda.length === 0 && <p className="text-3 py-10 text-center text-sm">Nothing planned this month.</p>}
        {agenda.map((d) => (
          <div key={iso(d)} className="fill rounded-[20px] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={clsx('text-[13px] font-extrabold', isToday(d) && 'text-iris')}>{format(d, 'EEE d MMM')}{isToday(d) && ' · Today'}</span>
              {onAdd && <button type="button" onClick={() => onAdd(iso(d))} className="text-3"><Plus className="size-4" /></button>}
            </div>
            <ItemList items={byDay.get(iso(d)) ?? []} />
          </div>
        ))}
        {onAdd && <Button block variant="glass" icon={<Plus className="size-4" />} onClick={() => onAdd(iso(new Date()))}>{addLabel}</Button>}
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? format(parseISO(open), 'EEEE d MMMM') : ''} width={480}
        footer={onAdd && open ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { const d = open; setOpen(null); onAdd(d); }}>{addLabel}</Button> : undefined}>
        {openItems.length ? <ItemList items={openItems} onPicked={() => setOpen(null)} /> : <p className="text-3 py-8 text-center text-sm">Nothing on this day.</p>}
      </Sheet>
    </div>
  );
}

function ItemList({ items, onPicked }: { items: CalItem[]; onPicked?: () => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          disabled={!it.onClick}
          onClick={() => { onPicked?.(); it.onClick?.(); }}
          className="glass-weak flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left enabled:hover:bg-[var(--fill-2)]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: it.color }}>{it.icon}</span>
          <span className="min-w-0 flex-1">
            <span className={clsx('block truncate text-[14px] font-bold', it.faded && 'line-through opacity-60')}>{it.title}</span>
            <span className="text-3 block truncate text-[12px]">{[it.kind, it.time, it.sub].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export const sameDay = (a: string, b: Date) => isSameDay(parseISO(a), b);
