import { useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { StackBar } from '../components/Charts.jsx';
import { heatCell } from '../components/Charts.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useCollection } from '../context/DataContext.jsx';
import { DEPARTMENT_COLOR, DEPARTMENTS } from '../lib/palette.js';

const STAGES = ['Backlog', 'To do', 'In progress', 'In review', 'Blocked', 'Done'];

/**
 * The grid clients ask about: how much work each squad holds, and what stage
 * each piece of it is at.
 */
export default function SquadsPage() {
  const { openPanel } = useOutletContext();
  const { optionColor } = useMeta();
  const navigate = useNavigate();
  const { rows: tasks } = useCollection('tasks');
  const { rows: people } = useCollection('people');

  const maxAt = (stage) => Math.max(1, ...DEPARTMENTS.map((d) => tasks.filter((t) => t.department === d && t.status === stage).length));

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>Squads &amp; stages</h1>
            <p>Which squad holds how much work, and what stage each piece of it is at.</p>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          <section className="card sp12">
            <div className="card-h">
              <h3>Every squad, every stage</h3>
              <span className="sub">open tickets by workflow stage</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 640, display: 'grid', gridTemplateColumns: `150px repeat(${STAGES.length}, 1fr) 92px`, gap: 3 }}>
                <div />
                {STAGES.map((s) => (
                  <div key={s} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center', paddingBottom: 5 }}>{s}</div>
                ))}
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center', paddingBottom: 5 }}>WIP load</div>

                {DEPARTMENTS.map((dept) => {
                  const squadTasks = tasks.filter((t) => t.department === dept);
                  const wip = squadTasks.filter((t) => ['In progress', 'In review'].includes(t.status)).length;
                  return (
                    <div key={dept} style={{ display: 'contents' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                        <i style={{ width: 9, height: 9, borderRadius: 3, background: DEPARTMENT_COLOR[dept] }} />
                        {dept}
                      </div>
                      {STAGES.map((stage) => {
                        const n = squadTasks.filter((t) => t.status === stage).length;
                        const style = heatCell(n ? (n / maxAt(stage)) * 0.95 : null);
                        return (
                          <button
                            type="button"
                            key={stage}
                            className="hm-c"
                            style={style}
                            title={`${dept} · ${stage}: ${n} tickets`}
                            onClick={() => navigate('/board/tasks?view=table')}
                          >
                            {n || ''}
                          </button>
                        );
                      })}
                      <div className="hm-c" style={{ background: wip > 5 ? 'var(--bad)' : 'var(--sunk)', color: wip > 5 ? '#fff' : 'var(--text-2)' }}>
                        {wip}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              Darker cells hold more tickets than their peers at that stage. Red WIP means more than
              five tickets in flight at once.
            </p>
          </section>

          {DEPARTMENTS.map((dept) => {
            const members = people.filter((p) => p.department === dept);
            const squadTasks = tasks.filter((t) => t.department === dept);
            const open = squadTasks.filter((t) => t.status !== 'Done');
            const distribution = STAGES.map((s) => ({
              label: s, color: optionColor('taskStatus', s), value: squadTasks.filter((t) => t.status === s).length,
            }));

            return (
              <section className="card sp4" key={dept}>
                <div className="card-h">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: DEPARTMENT_COLOR[dept] }} />
                    {dept}
                  </h3>
                  <span className="sub">{members.length} people</span>
                </div>

                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div className="kpi"><span className="l">Open</span><span className="v" style={{ fontSize: 22 }}>{open.length}</span></div>
                  <div className="kpi"><span className="l">In flight</span><span className="v" style={{ fontSize: 22 }}>{squadTasks.filter((t) => t.status === 'In progress').length}</span></div>
                  <div className="kpi">
                    <span className="l">Blocked</span>
                    <span className="v" style={{ fontSize: 22, color: squadTasks.some((t) => t.status === 'Blocked') ? 'var(--bad)' : 'inherit' }}>
                      {squadTasks.filter((t) => t.status === 'Blocked').length}
                    </span>
                  </div>
                </div>

                <StackBar segments={distribution} />

                <div>
                  {members.map((m) => {
                    const current = squadTasks.find((t) => t.assignee_id === m.id && t.status === 'In progress');
                    return (
                      <div className="listrow" key={m.id}>
                        <Avatar personId={m.id} size="sm" />
                        <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {current ? current.title : m.role_title}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
