import { useEffect, useState } from 'react';
import { Legend, MiniBars, StackBar, ColumnChart, LineChart } from '../components/Charts.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { api } from '../api/client.js';
import { DEPARTMENT_COLOR, DEPARTMENTS } from '../lib/palette.js';
import { groupBy, money, sum } from '../lib/format.js';

export default function ChartView({ board, resource, rows }) {
  const { options, optionColor } = useMeta();
  const { nameOf, collection } = useData();
  const [burndowns, setBurndowns] = useState([]);

  const activeSprints = resource === 'sprints' ? rows.filter((s) => s.status === 'Active') : [];

  useEffect(() => {
    if (!activeSprints.length) { setBurndowns([]); return; }
    Promise.all(activeSprints.map((s) => api.get(`/insights/burndown/${s.id}`).catch(() => null)))
      .then((list) => setBurndowns(list.filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, activeSprints.map((s) => s.id).join(',')]);

  const statusColumn = board.columns.find((c) => c.type === 'status');
  const moneyColumn = board.columns.find((c) => c.type === 'money');
  const ownerColumn = board.columns.find((c) => c.type === 'person');

  if (!rows.length) {
    return <div className="empty"><h3>Nothing to chart</h3><p>Add some items to this board first.</p></div>;
  }

  const statusSegments = statusColumn
    ? (options[statusColumn.options] ?? [])
        .map(([label, color]) => ({ label, color, value: rows.filter((r) => r[statusColumn.id] === label).length }))
        .filter((s) => s.value > 0)
    : [];

  return (
    <div className="dash">
      {statusColumn && (
        <section className="card sp6">
          <div className="card-h">
            <h3>{statusColumn.label} breakdown</h3>
            <span className="sub">{rows.length} items</span>
          </div>
          <StackBar segments={statusSegments} />
          <Legend items={statusSegments.map((s) => ({ ...s, value: s.value }))} />
          <MiniBars rows={statusSegments} />
        </section>
      )}

      {ownerColumn && (
        <section className="card sp6">
          <div className="card-h">
            <h3>By {ownerColumn.label.toLowerCase()}</h3>
            <span className="sub">item count</span>
          </div>
          <MiniBars
            rows={[...groupBy(rows, (r) => r[ownerColumn.id] ?? 0).entries()]
              .map(([id, group]) => ({ label: id ? nameOf('people', id) : 'Unassigned', value: group.length }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 10)}
          />
        </section>
      )}

      {rows.some((r) => r.department) && (
        <section className="card sp6">
          <div className="card-h"><h3>By squad</h3></div>
          <MiniBars
            rows={DEPARTMENTS.map((d) => ({
              label: d,
              color: DEPARTMENT_COLOR[d],
              value: rows.filter((r) => r.department === d).length,
            })).filter((r) => r.value > 0)}
          />
        </section>
      )}

      {moneyColumn && statusColumn && (
        <section className="card sp6">
          <div className="card-h"><h3>{moneyColumn.label} by {statusColumn.label.toLowerCase()}</h3></div>
          <MiniBars
            format={money}
            rows={(options[statusColumn.options] ?? [])
              .map(([label, color]) => ({
                label,
                color,
                value: sum(rows.filter((r) => r[statusColumn.id] === label), (r) => r[moneyColumn.id]),
              }))
              .filter((r) => r.value > 0)}
          />
        </section>
      )}

      {burndowns.map((b) => (
        <section className="card sp6" key={b.sprint}>
          <div className="card-h">
            <h3>Burndown — {b.sprint}</h3>
            <span className="sub">{b.committed} points committed</span>
          </div>
          <LineChart
            labels={b.series.map((p) => new Date(p.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}
            series={[
              { name: 'Ideal', color: 'var(--ramp-3)', dashed: true, data: b.series.map((p) => p.ideal) },
              { name: 'Actual remaining', color: 'var(--cat-1)', data: b.series.map((p) => p.actual) },
            ]}
            unit="pts"
            ariaLabel={`Burndown for ${b.sprint}`}
          />
          <Legend items={[{ label: 'Ideal burn', color: 'var(--ramp-3)' }, { label: 'Actual remaining', color: 'var(--cat-1)' }]} />
        </section>
      ))}

      {resource === 'sprints' && (
        <section className="card sp6">
          <div className="card-h"><h3>Velocity</h3><span className="sub">points shipped per completed sprint</span></div>
          <ColumnChart
            ariaLabel="Story points completed per sprint"
            data={rows
              .filter((s) => s.status === 'Completed')
              .slice(-7)
              .map((s) => ({
                label: s.name,
                short: `${s.name.split(' ')[0].slice(0, 4)} ${s.name.match(/\d+$/)?.[0] ?? ''}`,
                value: s.completed_points ?? 0,
              }))}
          />
        </section>
      )}

      {resource === 'time_logs' && (
        <section className="card sp6">
          <div className="card-h"><h3>Billable split</h3></div>
          <StackBar
            segments={[
              { label: 'Billable', color: '#00C875', value: Math.round(sum(rows.filter((r) => r.billable), (r) => r.hours)) },
              { label: 'Internal', color: '#808192', value: Math.round(sum(rows.filter((r) => !r.billable), (r) => r.hours)) },
            ]}
          />
          <Legend
            items={[
              { label: 'Billable', color: '#00C875', value: `${Math.round(sum(rows.filter((r) => r.billable), (r) => r.hours))}h` },
              { label: 'Internal', color: '#808192', value: `${Math.round(sum(rows.filter((r) => !r.billable), (r) => r.hours))}h` },
            ]}
          />
        </section>
      )}
    </div>
  );
}
