import { useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import { useGrouping } from './Cell.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { GROUP_PALETTE } from '../lib/palette.js';
import { clamp, formatDay, formatFullDay, groupBy, parseDay, textOn, today, DAY } from '../lib/format.js';

/** Every month between two dates, inclusive. */
function monthsBetween(from, to) {
  const out = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export default function TimelineView({ board, resource, rows, groupField, onOpen }) {
  const { optionColor } = useMeta();
  const { groupOf, orderKeys } = useGrouping(board, resource);
  const scrollRef = useRef(null);
  const config = board.timeline;

  const dated = rows.filter((r) => r[config.start] || r[config.end]);

  // Bring today into view on first paint rather than leaving the reader at the
  // far left of a year-long scale.
  useEffect(() => {
    const el = scrollRef.current?.querySelector('.tl-today');
    const scale = scrollRef.current?.querySelector('.tl-scale');
    const stage = scrollRef.current?.closest('.stage');
    if (!el || !scale || !stage) return;
    const x = scale.offsetLeft + scale.offsetWidth * (parseFloat(el.style.left) / 100);
    stage.scrollLeft = Math.max(0, x - stage.clientWidth * 0.42);
  }, [rows.length, groupField]);

  if (!dated.length) {
    return (
      <div className="empty">
        <h3>No dates to plot</h3>
        <p>Give these items a start and end date and they will appear on the timeline.</p>
      </div>
    );
  }

  let min = null;
  let max = null;
  dated.forEach((row) => {
    const start = parseDay(row[config.start]) ?? parseDay(row[config.end]);
    const end = parseDay(row[config.end]) ?? parseDay(row[config.start]);
    if (!min || start < min) min = start;
    if (!max || end > max) max = end;
  });

  const firstMonth = new Date(min.getFullYear(), min.getMonth(), 1);
  const lastMonth = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  const months = monthsBetween(firstMonth, lastMonth);
  const span = Math.max(1, lastMonth - firstMonth);
  const position = (date) => clamp(((date - firstMonth) / span) * 100, 0, 100);
  const now = today();
  const todayPct = now >= firstMonth && now <= lastMonth ? position(now) : null;

  const grouped = groupBy(dated, (row) => groupOf(row, groupField).key);
  const keys = orderKeys([...grouped.keys()], groupField);

  const gridlines = months.map((m, i) => <div className="gl" key={i} />);

  return (
    <div className="tl" ref={scrollRef}>
      <div className="tl-head">
        <div className="tl-lbl">{board.title}</div>
        <div className="tl-scale">
          {months.map((m) => (
            <div className="tl-mo" key={m.toISOString()}>
              {m.toLocaleDateString('en-GB', { month: 'short' })}{' '}
              <span style={{ color: 'var(--text-3)' }}>{String(m.getFullYear()).slice(2)}</span>
            </div>
          ))}
          {todayPct != null && <div className="tl-today lbl" style={{ left: `${todayPct}%` }} />}
        </div>
      </div>

      {keys.map((key, index) => {
        const items = grouped.get(key);
        const info = groupOf(items[0], groupField);
        const groupColor = info.color ?? GROUP_PALETTE[index % GROUP_PALETTE.length];

        return (
          <div key={key}>
            <div className="tl-row" style={{ background: 'var(--raise)' }}>
              <div className="tl-lbl" style={{ fontWeight: 700, color: groupColor }}>
                {info.label}
                <span style={{ color: 'var(--text-3)', fontWeight: 500, marginLeft: 'auto', fontSize: 11 }}>{items.length}</span>
              </div>
              <div className="tl-track">
                {gridlines}
                {todayPct != null && <div className="tl-today" style={{ left: `${todayPct}%` }} />}
              </div>
            </div>

            {items.map((row) => {
              const start = parseDay(row[config.start]) ?? parseDay(row[config.end]);
              const end = parseDay(row[config.end]) ?? parseDay(row[config.start]);
              const color = optionColor(config.options, row[config.color]);
              const left = position(start);
              const width = Math.max(config.diamond ? 0 : 1.2, position(end) - left);
              const duration = Math.max(1, Math.round((end - start) / DAY));
              const tight = width < 9;

              return (
                <div className="tl-row" key={row.id} onClick={() => onOpen(row)} style={{ cursor: 'pointer' }}>
                  <div className="tl-lbl">
                    {board.keyField && row[board.keyField] && (
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{row[board.keyField]}</span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row[board.columns[0].id]}
                    </span>
                    <span className="cell-open" style={{ opacity: 0.5 }}><Icon name="expand" /></span>
                  </div>
                  <div className="tl-track">
                    {gridlines}
                    {config.diamond ? (
                      <>
                        <span
                          className="tl-ms"
                          style={{ left: `${left}%`, background: color }}
                          title={`${row[board.columns[0].id]} — ${formatFullDay(row[config.start])}`}
                        />
                        <span className="tl-out" style={{ left: `calc(${left}% + 13px)` }}>{formatDay(row[config.start])}</span>
                      </>
                    ) : (
                      <>
                        <div
                          className="tl-bar"
                          style={{ left: `${left}%`, width: `${width}%`, background: color, color: textOn(color), padding: tight ? 0 : '0 9px' }}
                          title={`${row[config.color] ?? ''} · ${formatFullDay(row[config.start])} → ${formatFullDay(row[config.end])} · ${duration} days`}
                        >
                          {!tight && (
                            <>
                              <span>{row[config.color]}</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.8 }}>{duration}d</span>
                            </>
                          )}
                        </div>
                        {tight && (
                          <span className="tl-out" style={{ left: `calc(${left + width}% + 8px)` }}>
                            {row[config.color]} · {duration}d
                          </span>
                        )}
                      </>
                    )}
                    {todayPct != null && <div className="tl-today" style={{ left: `${todayPct}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
