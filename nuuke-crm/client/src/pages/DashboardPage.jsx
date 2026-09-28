import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import { Legend, MiniBars, StackBar, ColumnChart } from '../components/Charts.jsx';
import { Pill } from '../components/Pill.jsx';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useCollection } from '../context/DataContext.jsx';
import { DEPARTMENT_COLOR } from '../lib/palette.js';
import { formatDay, money, relativeTime, sum } from '../lib/format.js';

function Kpi({ label, value, note, tone }) {
  return (
    <section className="card sp3">
      <div className="kpi">
        <span className="l">{label}</span>
        <span className="v">{value}</span>
        <span className="d" style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : 'var(--text-3)' }}>
          {note}
        </span>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { openPanel } = useOutletContext();
  const { isManager } = useAuth();
  const { optionColor } = useMeta();
  const { rows: sprints } = useCollection('sprints');
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    api.get('/insights/dashboard').then(setData).catch(() => {});
    api.get('/insights/activity').then(setActivity).catch(() => {});
  }, []);

  if (!data) {
    return (
      <>
        <header className="bar"><div className="bar-top"><div className="bar-title"><h1>Company dashboard</h1></div></div></header>
        <div className="stage"><div className="empty"><p>Computing…</p></div></div>
      </>
    );
  }

  const healthSegments = data.projectHealth.map((h) => ({
    label: h.health, value: h.count, color: optionColor('health', h.health),
  }));
  const severitySegments = data.defects.map((d) => ({
    label: d.severity, value: d.count, color: optionColor('severity', d.severity),
  }));
  const blockers = data.defects.filter((d) => ['Blocker', 'Critical'].includes(d.severity)).reduce((s, d) => s + d.count, 0);
  const completed = sprints.filter((s) => s.status === 'Completed').slice(-7);

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title">
            <h1>Company dashboard</h1>
            <p>Delivery, quality and capacity in a single read. Every figure is computed live from the boards.</p>
          </div>
        </div>
      </header>

      <div className="stage">
        <div className="dash">
          {isManager && data.weighted && (
            <>
              <Kpi label="Open pipeline" value={money(data.weighted.open_value)} note={`${money(data.weighted.weighted)} weighted by confidence`} />
              <Kpi label="Signed" value={money(data.won.value)} note={`${data.won.count} deals closed`} tone="ok" />
            </>
          )}
          <Kpi
            label="Projects in flight"
            value={data.delivery.live}
            note={data.delivery.at_risk ? `${data.delivery.at_risk} flagged at risk` : 'all healthy'}
            tone={data.delivery.at_risk ? 'bad' : 'ok'}
          />
          <Kpi
            label="Open defects"
            value={severitySegments.reduce((s, x) => s + x.value, 0)}
            note={blockers ? `${blockers} blocker or critical` : 'no blockers open'}
            tone={blockers ? 'bad' : 'ok'}
          />
          {!isManager && (
            <>
              <Kpi label="Support open" value={data.support.open} note={data.support.breached ? `${data.support.breached} past SLA` : 'all inside SLA'} tone={data.support.breached ? 'bad' : 'ok'} />
              <Kpi label="Team capacity" value={`${Math.round(data.capacity.capacity)}h`} note={`${data.capacity.headcount} people`} />
            </>
          )}

          {isManager && data.pipeline && (
            <section className="card sp6">
              <div className="card-h"><h3>Pipeline by stage</h3><span className="sub">open deal value</span></div>
              <MiniBars
                format={money}
                rows={data.pipeline.filter((p) => !['Won', 'Lost'].includes(p.stage)).map((p) => ({ label: p.stage, value: p.value }))}
              />
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                Won and lost deals are excluded. Confidence-weighted total: <b>{money(data.weighted.weighted)}</b>.
              </p>
            </section>
          )}

          <section className="card sp6">
            <div className="card-h"><h3>Delivery health</h3><span className="sub">{data.delivery.total} projects</span></div>
            <StackBar segments={healthSegments} />
            <Legend items={healthSegments.filter((s) => s.value > 0)} />
          </section>

          <section className="card sp6">
            <div className="card-h"><h3>Open work by squad</h3><span className="sub">tickets not yet done</span></div>
            <MiniBars rows={data.squads.filter((s) => s.open > 0).map((s) => ({ label: s.department, value: s.open, color: DEPARTMENT_COLOR[s.department] }))} />
            <Legend items={data.squads.filter((s) => s.open > 0).map((s) => ({ label: s.department, color: DEPARTMENT_COLOR[s.department], value: s.open }))} />
          </section>

          {completed.length > 0 && (
            <section className="card sp6">
              <div className="card-h"><h3>Velocity</h3><span className="sub">points shipped per completed sprint</span></div>
              <ColumnChart
                ariaLabel="Story points completed per sprint"
                data={completed.map((s) => ({
                  label: s.name,
                  short: `${s.name.split(' ')[0].slice(0, 4)} ${s.name.match(/\d+$/)?.[0] ?? ''}`,
                  value: s.completed_points ?? 0,
                }))}
              />
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                Rolling average <b>{Math.round(sum(completed, (s) => s.completed_points) / completed.length)} points</b> per sprint.
              </p>
            </section>
          )}

          <section className="card sp4">
            <div className="card-h"><h3>Open defects</h3></div>
            <StackBar segments={severitySegments} />
            <Legend items={severitySegments.filter((s) => s.value > 0)} />
          </section>

          <section className="card sp4">
            <div className="card-h"><h3>Support desk</h3><span className="sub">{data.support.open} open</span></div>
            <p style={{ margin: 0, fontSize: 12.5, color: data.support.breached ? 'var(--bad)' : 'var(--ok)' }}>
              {data.support.breached
                ? `${data.support.breached} request${data.support.breached === 1 ? '' : 's'} past SLA.`
                : 'Every open request is inside SLA.'}
            </p>
          </section>

          <section className="card sp4">
            <div className="card-h"><h3>Shipping next</h3><span className="sub">{data.releases.length} in flight</span></div>
            {data.releases.length === 0 ? (
              <p style={{ color: 'var(--text-3)', margin: 0, fontSize: 13 }}>Nothing queued for release.</p>
            ) : (
              <div className="mini">
                {data.releases.map((r) => (
                  <div className="mini-r" key={r.name}>
                    <span className="n" title={r.name}>{r.name}</span>
                    <Pill label={r.status} color={optionColor('releaseStatus', r.status)} />
                    <span className="v mono">{formatDay(r.target_on)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {isManager && data.revenueByClient && (
            <section className="card sp8">
              <div className="card-h"><h3>Revenue by account</h3><span className="sub">annual contract value</span></div>
              <MiniBars format={money} rows={data.revenueByClient.map((c) => ({ label: c.name, value: c.arr }))} />
            </section>
          )}

          <section className={isManager ? 'card sp4' : 'card sp12'}>
            <div className="card-h"><h3>Activity</h3></div>
            <div className="feed">
              {activity.slice(0, 16).map((a) => (
                <div className="feed-i" key={a.id}>
                  <Avatar personId={a.actor_id} size="sm" />
                  <span style={{ minWidth: 0 }}>{a.text}</span>
                  <span className="t">{relativeTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
