import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { DeptChip, Pill } from '../components/Pill.jsx';
import { MiniBars } from '../components/Charts.jsx';
import ItemDrawer from '../components/ItemDrawer.jsx';
import { BOARDS } from '../boards/boardConfig.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useCollection, useData } from '../context/DataContext.jsx';
import { clamp, daysUntil, formatDay, relativeTime, sum } from '../lib/format.js';

const STATUS_ORDER = ['Blocked', 'In review', 'In progress', 'To do', 'Backlog'];

export default function MyWorkPage() {
  const { openPanel } = useOutletContext();
  const { user } = useAuth();
  const { optionColor, can } = useMeta();
  const { nameOf, update } = useData();
  const { rows: tasks } = useCollection('tasks');
  const { rows: sprints } = useCollection('sprints');
  const { rows: bugs } = useCollection('bugs');
  const { rows: tickets } = useCollection('tickets');
  const { rows: people } = useCollection('people');
  const [activity, setActivity] = useState([]);
  const [openRow, setOpenRow] = useState(null);

  useEffect(() => { api.get('/insights/activity').then(setActivity).catch(() => {}); }, []);

  const me = people.find((p) => p.id === user.person_id);
  const mine = tasks.filter((t) => t.assignee_id === user.person_id);
  const open = mine.filter((t) => t.status !== 'Done');
  const overdue = open.filter((t) => t.due_on && daysUntil(t.due_on) < 0);
  const dueSoon = open.filter((t) => t.due_on && daysUntil(t.due_on) >= 0 && daysUntil(t.due_on) <= 7);
  const activeSprintIds = new Set(sprints.filter((s) => s.status === 'Active').map((s) => s.id));
  const points = sum(open.filter((t) => activeSprintIds.has(t.sprint_id)), (t) => t.points);
  const myBugs = bugs.filter((b) => b.assignee_id === user.person_id && !['Closed', "Won't fix"].includes(b.status));
  const myTickets = tickets.filter((t) => t.assignee_id === user.person_id && !['Resolved', 'Closed'].includes(t.status));

  const kpis = [
    { label: 'Open tickets', value: open.length, note: overdue.length ? `${overdue.length} overdue` : 'nothing overdue', bad: overdue.length > 0 },
    { label: 'Due within 7 days', value: dueSoon.length, note: dueSoon.length ? `next: ${formatDay([...dueSoon].sort((a, b) => a.due_on.localeCompare(b.due_on))[0].due_on)}` : 'clear' },
    { label: 'Points in flight', value: points, note: 'active sprint commitment' },
    { label: 'Logged hours', value: `${sum(mine, (t) => t.logged_hours).toFixed(0)}h`, note: `against ${me?.capacity_hours ?? 0}h a week` },
  ];

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>My work</h1>
            <p>Everything assigned to you across sprints, defects and support — in one place.</p>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          <section className="card sp12" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Avatar personId={user.person_id} size="lg" />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>{user.name}</h2>
              <p style={{ margin: '2px 0 0', color: 'var(--text-2)', fontSize: 13 }}>
                {[me?.role_title, me?.department, me?.location].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {me && <Pill label={me.status} color={optionColor('peopleStatus', me.status)} />}
              <span className="chip">{me?.capacity_hours ?? 0}h capacity/wk</span>
              <span className="chip">{user.role.toLowerCase()}</span>
            </div>
          </section>

          {kpis.map((k) => (
            <section className="card sp3" key={k.label}>
              <div className="kpi">
                <span className="l">{k.label}</span>
                <span className="v">{k.value}</span>
                <span className="d" style={{ color: k.bad ? 'var(--bad)' : 'var(--text-3)' }}>{k.note}</span>
              </div>
            </section>
          ))}

          <section className="card sp8">
            <div className="card-h">
              <h3>My tickets</h3>
              <span className="sub">{open.length} open · click to open one</span>
            </div>
            {open.length === 0 ? (
              <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>Nothing assigned right now.</p>
            ) : (
              STATUS_ORDER.filter((s) => open.some((t) => t.status === s)).map((status) => (
                <div key={status} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Pill label={status} color={optionColor('taskStatus', status)} />
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                      {open.filter((t) => t.status === status).length}
                    </span>
                  </div>
                  {open
                    .filter((t) => t.status === status)
                    .sort((a, b) => String(a.due_on ?? 'z').localeCompare(String(b.due_on ?? 'z')))
                    .map((t) => {
                      const late = t.due_on && daysUntil(t.due_on) < 0;
                      return (
                        <button type="button" className="p-item" key={t.id} style={{ width: '100%', marginBottom: 6, cursor: 'pointer' }} onClick={() => setOpenRow(t)}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.key}</span>
                          <span className="nm">{t.title}</span>
                          <span className="rt">
                            <DeptChip value={t.department} />
                            <Pill label={t.priority} color={optionColor('priority', t.priority)} />
                            <span className="mono" style={{ fontSize: 11, color: late ? 'var(--bad)' : 'var(--text-2)' }}>
                              {t.due_on ? formatDay(t.due_on) : 'no date'}
                            </span>
                            <span className="chip">{nameOf('projects', t.project_id)}</span>
                          </span>
                        </button>
                      );
                    })}
                </div>
              ))
            )}
          </section>

          <section className="card sp4">
            <div className="card-h"><h3>Also on your plate</h3></div>
            <MiniBars
              rows={[
                { label: 'Defects', value: myBugs.length, color: '#E2445C' },
                { label: 'Support requests', value: myTickets.length, color: '#FDAB3D' },
              ]}
            />
            {myBugs.length > 0 && (
              <>
                <div className="dw-sec" style={{ margin: '16px 0 6px' }}>Highest severity defects</div>
                {myBugs.slice(0, 5).map((b) => (
                  <button type="button" className="listrow" key={b.id} onClick={() => setOpenRow({ ...b, __resource: 'bugs' })}>
                    <Pill label={b.severity} color={optionColor('severity', b.severity)} />
                    <span className="txt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                  </button>
                ))}
              </>
            )}
          </section>

          <section className="card sp8">
            <div className="card-h"><h3>Active sprints</h3><span className="sub">commitment vs shipped</span></div>
            {sprints.filter((s) => s.status === 'Active').length === 0 ? (
              <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>No sprint is currently active.</p>
            ) : (
              sprints.filter((s) => s.status === 'Active').map((s) => {
                const items = tasks.filter((t) => t.sprint_id === s.id);
                const shipped = sum(items.filter((t) => t.status === 'Done'), (t) => t.points);
                const total = s.committed_points || sum(items, (t) => t.points) || 1;
                const left = daysUntil(s.end_on);
                return (
                  <div key={s.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                      <strong style={{ fontSize: 13.5 }}>{s.name}</strong>
                      <span className="chip">{nameOf('projects', s.project_id)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, color: left < 0 ? 'var(--bad)' : 'var(--text-3)' }}>
                        {left < 0 ? `${Math.abs(left)}d over` : `${left}d left`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className="prog" style={{ height: 8 }}>
                        <i style={{ width: `${clamp((shipped / total) * 100, 0, 100)}%` }} />
                      </span>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {shipped}/{total} pts
                      </span>
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 12.5, color: 'var(--text-2)' }}>{s.goal}</p>
                  </div>
                );
              })
            )}
          </section>

          <section className="card sp4">
            <div className="card-h"><h3>Recent activity</h3></div>
            {activity.length === 0 ? (
              <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>No changes logged yet.</p>
            ) : (
              <div className="feed">
                {activity.slice(0, 14).map((a) => (
                  <div className="feed-i" key={a.id}>
                    <Avatar personId={a.actor_id} size="sm" />
                    <span style={{ minWidth: 0 }}>{a.text}</span>
                    <span className="t">{relativeTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {openRow && (
        <ItemDrawer
          board={BOARDS[openRow.__resource ?? 'tasks']}
          resource={openRow.__resource ?? 'tasks'}
          row={openRow}
          editable={can(openRow.__resource ?? 'tasks', 'write')}
          canDelete={false}
          onPatch={(values) => update(openRow.__resource ?? 'tasks', openRow.id, values)}
          onDelete={() => {}}
          onClose={() => setOpenRow(null)}
        />
      )}
    </>
  );
}
