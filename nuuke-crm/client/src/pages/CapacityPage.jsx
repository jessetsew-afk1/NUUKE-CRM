import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { heatCell } from '../components/Charts.jsx';
import { api } from '../api/client.js';
import { DEPARTMENT_COLOR, DEPARTMENTS } from '../lib/palette.js';
import { formatDay, groupBy } from '../lib/format.js';

export default function CapacityPage() {
  const { openPanel } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [weeks, setWeeks] = useState(8);

  useEffect(() => {
    api.get(`/insights/capacity?weeks=${weeks}`).then(setRows).catch(() => setRows([]));
  }, [weeks]);

  const weekStarts = [...new Set(rows.map((r) => r.week_start))].sort();
  const byPerson = groupBy(rows, (r) => r.person_id);
  const people = [...byPerson.values()].map((list) => list[0]);
  const byDepartment = groupBy(people, (p) => p.department);
  const thisWeek = weekStarts[0];
  const over = rows.filter((r) => r.week_start === thisWeek && r.allocated > r.capacity_hours);

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>Capacity planner</h1>
            <p>Who has room, who is over, and where leave collides with a sprint.</p>
          </div>
          <div className="bar-actions">
            <select className="input" style={{ width: 'auto' }} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks ahead">
              {[4, 8, 12, 16].map((w) => <option key={w} value={w}>{w} weeks</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          <section className="card sp12">
            <div className="card-h">
              <h3>Allocation</h3>
              <span className="sub">allocated hours against contracted capacity</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 720, display: 'grid', gap: 3, gridTemplateColumns: `190px repeat(${weekStarts.length}, 1fr)` }}>
                <div />
                {weekStarts.map((w) => (
                  <div key={w} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center' }}>{formatDay(w)}</div>
                ))}

                {DEPARTMENTS.filter((d) => byDepartment.has(d)).map((dept) => (
                  <div key={dept} style={{ display: 'contents' }}>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 7, padding: '9px 0 3px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                      <i style={{ width: 8, height: 8, borderRadius: 3, background: DEPARTMENT_COLOR[dept] }} />
                      {dept}
                    </div>
                    {byDepartment.get(dept).map((person) => (
                      <div key={person.person_id} style={{ display: 'contents' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, minWidth: 0 }}>
                          <Avatar personId={person.person_id} size="sm" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
                        </div>
                        {weekStarts.map((w) => {
                          const cell = byPerson.get(person.person_id).find((r) => r.week_start === w);
                          if (cell?.on_leave) {
                            return (
                              <div key={w} className="hm-c" title={`${person.name} — approved leave`}
                                style={{ background: 'repeating-linear-gradient(45deg,var(--sunk),var(--sunk) 4px,var(--line) 4px,var(--line) 8px)', color: 'var(--text-3)' }}>
                                off
                              </div>
                            );
                          }
                          const ratio = cell && cell.capacity_hours ? cell.allocated / cell.capacity_hours : 0;
                          return (
                            <div key={w} className="hm-c" style={heatCell(cell?.allocated ? ratio : null)}
                              title={`${person.name} · week of ${formatDay(w)}: ${cell?.allocated ?? 0}h of ${cell?.capacity_hours ?? 0}h`}>
                              {cell?.allocated ? `${Math.round(ratio * 100)}%` : ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg">
              <span><i style={{ background: 'var(--ramp-1)' }} />under 20%</span>
              <span><i style={{ background: 'var(--ramp-3)' }} />around half</span>
              <span><i style={{ background: 'var(--ramp-5)' }} />near full</span>
              <span><i style={{ background: 'var(--bad)' }} />over capacity</span>
              <span><i style={{ background: 'repeating-linear-gradient(45deg,var(--sunk),var(--sunk) 3px,var(--line) 3px,var(--line) 6px)' }} />approved leave</span>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              Allocation is estimated hours on open tickets, spread evenly across each ticket’s start
              and due dates. Booked leave removes the week entirely.
            </p>
          </section>

          <section className="card sp6">
            <div className="card-h"><h3>Over capacity this week</h3></div>
            {over.length === 0 ? (
              <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>Nobody is over their contracted hours this week.</p>
            ) : (
              <div className="mini">
                {over.map((r) => (
                  <div className="mini-r" key={r.person_id}>
                    <span className="n">{r.name}</span>
                    <span className="bar"><i style={{ width: '100%', background: 'var(--bad)' }} /></span>
                    <span className="v mono">{r.allocated}h/{r.capacity_hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
