import { useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useCollection, useData } from '../context/DataContext.jsx';
import { clamp, formatFullDay, groupBy, parseDay, textOn, today } from '../lib/format.js';
import { GROUP_PALETTE } from '../lib/palette.js';

function monthsBetween(from, to) {
  const out = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) { out.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
  return out;
}

export default function RoadmapPage() {
  const { openPanel } = useOutletContext();
  const { optionColor, options } = useMeta();
  const { nameOf } = useData();
  const navigate = useNavigate();
  const { rows: projects } = useCollection('projects');
  const { rows: tasks } = useCollection('tasks');
  const { rows: milestones } = useCollection('milestones');
  const ref = useRef(null);

  const dated = projects.filter((p) => p.start_on && p.end_on);

  useEffect(() => {
    const marker = ref.current?.querySelector('.tl-today');
    const scale = ref.current?.querySelector('.tl-scale');
    const stage = ref.current?.closest('.stage');
    if (!marker || !scale || !stage) return;
    const x = scale.offsetLeft + scale.offsetWidth * (parseFloat(marker.style.left) / 100);
    stage.scrollLeft = Math.max(0, x - stage.clientWidth * 0.42);
  }, [dated.length]);

  if (!dated.length) {
    return (
      <>
        <header className="bar"><div className="bar-top"><div className="bar-title"><h1>Portfolio roadmap</h1></div></div></header>
        <div className="stage"><div className="empty"><h3>No dated projects</h3><p>Add start and end dates to projects to see them here.</p></div></div>
      </>
    );
  }

  let min = null; let max = null;
  dated.forEach((p) => {
    const s = parseDay(p.start_on); const e = parseDay(p.end_on);
    if (!min || s < min) min = s;
    if (!max || e > max) max = e;
  });
  milestones.forEach((m) => {
    const d = parseDay(m.due_on);
    if (d) { if (d < min) min = d; if (d > max) max = d; }
  });

  const firstMonth = new Date(min.getFullYear(), min.getMonth(), 1);
  const lastMonth = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  const months = monthsBetween(firstMonth, lastMonth);
  const span = Math.max(1, lastMonth - firstMonth);
  const position = (d) => clamp(((d - firstMonth) / span) * 100, 0, 100);
  const now = today();
  const todayPct = now >= firstMonth && now <= lastMonth ? position(now) : null;
  const byClient = groupBy(dated, (p) => p.client_id);
  const gridlines = months.map((_, i) => <div className="gl" key={i} />);

  const progressOf = (project) => {
    const items = tasks.filter((t) => t.project_id === project.id);
    if (!items.length) return 0;
    return Math.round((items.filter((t) => t.status === 'Done').length / items.length) * 100);
  };

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>Portfolio roadmap</h1>
            <p>Every engagement on one time axis, with client-facing milestones marked.</p>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="tl" ref={ref}>
          <div className="tl-head">
            <div className="tl-lbl">Portfolio</div>
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

          {[...byClient.entries()].map(([clientId, list], index) => (
            <div key={clientId}>
              <div className="tl-row" style={{ background: 'var(--raise)' }}>
                <div className="tl-lbl" style={{ fontWeight: 700, color: GROUP_PALETTE[index % GROUP_PALETTE.length] }}>
                  {nameOf('clients', clientId) || 'Internal'}
                </div>
                <div className="tl-track">
                  {gridlines}
                  {todayPct != null && <div className="tl-today" style={{ left: `${todayPct}%` }} />}
                </div>
              </div>

              {list.map((project) => {
                const start = parseDay(project.start_on);
                const end = parseDay(project.end_on);
                const color = optionColor('projectStatus', project.status);
                const left = position(start);
                const width = Math.max(1.5, position(end) - left);
                const progress = progressOf(project);
                const marks = milestones.filter((m) => m.project_id === project.id && m.due_on);

                return (
                  <div className="tl-row" key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/board/projects')}>
                    <div className="tl-lbl">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                      <span className="cell-open" style={{ opacity: 0.5 }}><Icon name="expand" /></span>
                    </div>
                    <div className="tl-track">
                      {gridlines}
                      <div
                        className="tl-bar"
                        style={{ left: `${left}%`, width: `${width}%`, background: color, color: textOn(color), padding: '0 9px' }}
                        title={`${project.name} — ${formatFullDay(project.start_on)} → ${formatFullDay(project.end_on)}`}
                      >
                        <i className="fill" style={{ width: `${progress}%` }} />
                        <span>{project.status}</span>
                        <span style={{ marginLeft: 'auto', opacity: 0.85 }}>{progress}%</span>
                      </div>
                      {marks.map((m) => (
                        <span
                          key={m.id}
                          className="tl-ms"
                          style={{ left: `${position(parseDay(m.due_on))}%`, background: optionColor('milestoneStatus', m.status) }}
                          title={`${m.name} — ${formatFullDay(m.due_on)} (${m.status})`}
                        />
                      ))}
                      {todayPct != null && <div className="tl-today" style={{ left: `${todayPct}%` }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 18px 40px' }}>
          <div className="lg">
            {(options.projectStatus ?? []).map(([label, color]) => (
              <span key={label}><i style={{ background: color }} />{label}</span>
            ))}
            <span><i style={{ background: 'var(--text)', transform: 'rotate(45deg)', borderRadius: 2 }} />milestone</span>
            <span><i style={{ background: 'var(--bad)', width: 3 }} />today</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
            The lighter fill inside each bar is the share of that project’s tickets already done.
          </p>
        </div>
      </div>
    </>
  );
}
