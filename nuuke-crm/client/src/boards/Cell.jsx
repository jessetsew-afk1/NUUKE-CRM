import { useRef, useState } from 'react';
import Avatar, { AvatarStack } from '../components/Avatar.jsx';
import Menu from '../components/Menu.jsx';
import { DeptChip, Pill, Progress, SlaPill, Stars } from '../components/Pill.jsx';
import Icon from '../components/Icon.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { clamp, formatDay, daysUntil, money, parseDay, textOn, DAY, today } from '../lib/format.js';

/** A status cell: the full-bleed coloured fill, opening a picker when editable. */
function StatusCell({ column, row, editable, onChange }) {
  const { optionColor, options } = useMeta();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const color = optionColor(column.options, row[column.id]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="statuscell"
        disabled={!editable}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ background: color, color: textOn(color) }}
      >
        {row[column.id] ?? '—'}
      </button>
      {open && (
        <Menu
          anchorRef={anchorRef}
          title={column.label}
          onClose={() => setOpen(false)}
          items={(options[column.options] ?? []).map(([label, swatch]) => ({
            label,
            color: swatch,
            checked: row[column.id] === label,
            onSelect: () => onChange({ [column.id]: label }),
          }))}
        />
      )}
    </>
  );
}

function PersonCell({ column, row, editable, onChange }) {
  const { collection } = useData();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const person = collection('people').find((p) => p.id === row[column.id]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={!editable}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, width: '100%', textAlign: 'left', cursor: editable ? 'pointer' : 'default' }}
      >
        <Avatar personId={row[column.id]} size="sm" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: person ? 'inherit' : 'var(--text-3)' }}>
          {person?.name ?? 'Unassigned'}
        </span>
      </button>
      {open && (
        <Menu
          anchorRef={anchorRef}
          title={column.label}
          onClose={() => setOpen(false)}
          items={[
            { label: 'Unassigned', key: 'none', onSelect: () => onChange({ [column.id]: null }) },
            ...collection('people').map((p) => ({
              label: `${p.name} — ${p.role_title}`,
              key: p.id,
              personId: p.id,
              checked: row[column.id] === p.id,
              onSelect: () => onChange({ [column.id]: p.id }),
            })),
          ]}
        />
      )}
    </>
  );
}

/** A date range drawn as a bar, with the elapsed share filled in. */
function TimelineCell({ column, row }) {
  const start = parseDay(row[column.start]);
  const end = parseDay(row[column.end]);
  if (!start && !end) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const from = start ?? end;
  const to = end ?? start;
  const total = Math.max(1, (to - from) / DAY);
  const elapsed = clamp((today() - from) / DAY, 0, total);
  const pct = Math.round((elapsed / total) * 100);

  return (
    <div className="tlbar" style={{ background: to < today() && pct >= 100 ? 'var(--ramp-4)' : 'var(--ramp-5)' }}>
      <i className="fill" style={{ width: `${pct}%` }} />
      <span>{formatDay(row[column.start])} → {formatDay(row[column.end])}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.75 }}>{Math.max(0, Math.round(total))}d</span>
    </div>
  );
}

export default function Cell({ column, row, editable, onChange }) {
  const { nameOf } = useData();
  const value = row[column.id];

  switch (column.type) {
    case 'status':
      return <StatusCell column={column} row={row} editable={editable} onChange={onChange} />;
    case 'person':
      return <PersonCell column={column} row={row} editable={editable} onChange={onChange} />;
    case 'dept':
      return <DeptChip value={value} />;
    case 'people':
      return <AvatarStack ids={value ?? []} />;
    case 'timeline':
      return <TimelineCell column={column} row={row} />;
    case 'date': {
      if (!value) return <span style={{ color: 'var(--text-3)' }}>—</span>;
      const days = daysUntil(value);
      const overdue = days != null && days < 0;
      return (
        <>
          <span className="num" style={{ fontSize: 12.5, ...(overdue ? { color: 'var(--bad)', fontWeight: 600 } : {}) }}>
            {formatDay(value)}
          </span>
          {days != null && days >= 0 && days <= 7 && (
            <span className="chip" style={{ fontSize: 10, padding: '1px 5px' }}>{days === 0 ? 'today' : `${days}d`}</span>
          )}
        </>
      );
    }
    case 'money':
      return <span className="num" style={{ fontWeight: 600 }}>{money(value)}</span>;
    case 'num':
      return <span className="num">{value ?? '—'}</span>;
    case 'hours':
      return <span className="mono" style={{ fontSize: 12 }}>{value == null ? '—' : `${value}h`}</span>;
    case 'points':
      return value == null ? (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      ) : (
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, background: 'var(--sunk)', borderRadius: 6, padding: '2px 7px' }}>
          {value}
        </span>
      );
    case 'pct':
      return <Progress value={value} />;
    case 'sla':
      return <SlaPill due={value} />;
    case 'rating':
      return <Stars value={value} />;
    case 'bool':
      return value ? (
        <span style={{ color: 'var(--ok)', display: 'flex' }}><Icon name="check" size={16} /></span>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      );
    case 'tags': {
      const tags = Array.isArray(value) ? value : value ? [value] : [];
      return tags.length ? (
        <>{tags.map((t) => <span className="chip" key={t}>{t}</span>)}</>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      );
    }
    case 'ref': {
      const label = nameOf(column.ref, value);
      return label ? (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      );
    }
    default:
      return value === null || value === undefined || value === '' ? (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      ) : (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value)}</span>
      );
  }
}

/** Shared grouping logic — the same rules the table, kanban and timeline use. */
export function useGrouping(board, resource) {
  const { nameOf } = useData();
  const { optionColor, options } = useMeta();

  const groupOf = (row, field) => {
    const column = board.columns.find((c) => c.id === field);
    const value = row[field];
    if (!column) return { key: 'all', label: 'All items', color: null };
    if (column.type === 'status') return { key: value ?? '—', label: value ?? 'No status', color: optionColor(column.options, value) };
    if (column.type === 'dept') return { key: value ?? '—', label: value ?? 'Unassigned squad', color: null, dept: value };
    if (column.type === 'person') return { key: value ?? '—', label: value ? nameOf('people', value) : 'Unassigned', color: null };
    if (column.type === 'ref') return { key: value ?? '—', label: nameOf(column.ref, value) || 'Unassigned', color: null };
    return { key: String(value ?? '—'), label: String(value ?? '—'), color: null };
  };

  const orderKeys = (keys, field) => {
    const column = board.columns.find((c) => c.id === field);
    if (column?.type === 'status') {
      const order = (options[column.options] ?? []).map(([label]) => label);
      return [...keys].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
    }
    return [...keys].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  };

  return { groupOf, orderKeys };
}
