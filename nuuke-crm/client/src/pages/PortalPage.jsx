import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wordmark } from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Pill, SlaPill } from '../components/Pill.jsx';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { clamp, formatDay, formatFullDay, moneyFull, daysUntil } from '../lib/format.js';

/**
 * Colours here are literal rather than fetched from /api/meta, because a client
 * login has no access to that endpoint — the portal is deliberately served by
 * one route and nothing else.
 */
const COLORS = {
  projectStatus: { Discovery: '#579BFC', Design: '#FF5AC4', 'In development': '#FDAB3D', QA: '#A25DDC', UAT: '#0086C0', Launched: '#00C875', 'On hold': '#808192' },
  taskStatus: { 'In progress': '#FDAB3D', 'In review': '#A25DDC', Done: '#00C875' },
  milestoneStatus: { Upcoming: '#579BFC', 'At risk': '#FDAB3D', Slipped: '#E2445C', Delivered: '#00C875' },
  approvalStatus: { 'Awaiting client': '#FDAB3D', 'Changes requested': '#FF642E', Approved: '#00C875' },
  releaseStatus: { Planning: '#C3C6D4', Building: '#579BFC', 'In QA': '#FDAB3D', Submitted: '#A25DDC', 'In review': '#784BD1', Live: '#00C875', Rejected: '#E2445C' },
  ticketStatus: { New: '#579BFC', Open: '#FDAB3D', 'Pending client': '#A25DDC', Escalated: '#E2445C', Resolved: '#00C875', Closed: '#808192' },
  priority: { Critical: '#BB3354', High: '#FF642E', Medium: '#579BFC', Low: '#C3C6D4' },
  invoiceStatus: { Draft: '#C3C6D4', Sent: '#579BFC', Paid: '#00C875', Overdue: '#E2445C' },
};

const ticketSchema = z.object({
  subject: z.string().trim().min(5, 'Give it a subject of at least five characters').max(300),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
});

function RaiseTicket({ onClose, onCreated }) {
  const { error } = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(ticketSchema), defaultValues: { subject: '', priority: 'Medium' } });

  const submit = async (values) => {
    try {
      onCreated(await api.post('/portal/tickets', values));
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <Modal title="Raise a request" hint="It reaches the Nuuke support desk straight away, on your contracted SLA." onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <div className="field">
          <label htmlFor="subject">What do you need?</label>
          <input id="subject" className="input" aria-invalid={Boolean(errors.subject)} {...register('subject')} />
          {errors.subject && <span className="err">{errors.subject.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="priority">How urgent is it?</label>
          <select id="priority" className="input" {...register('priority')}>
            <option value="Critical">Critical — something is down</option>
            <option value="High">High — blocking work</option>
            <option value="Medium">Medium — needs attention</option>
            <option value="Low">Low — whenever you can</option>
          </select>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>Send it</button>
        </div>
      </form>
    </Modal>
  );
}

export default function PortalPage({ preview = false }) {
  const { user, logout } = useAuth();
  const { toast, error } = useToast();
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [raising, setRaising] = useState(false);

  const load = useCallback(async (id) => {
    const query = preview && id ? `?clientId=${id}` : '';
    try {
      setData(await api.get(`/portal/overview${query}`));
    } catch (err) {
      error(err.message);
    }
  }, [preview, error]);

  useEffect(() => {
    if (!preview) { load(); return; }
    api.get('/portal/accounts').then((list) => {
      setAccounts(list);
      const first = list[0]?.id ?? null;
      setAccountId(first);
      if (first) load(first);
    }).catch(() => {});
  }, [preview, load]);

  const respond = async (approval, decision) => {
    try {
      await api.post(`/portal/approvals/${approval.id}/respond`, { decision });
      toast(decision === 'Approved' ? 'Approved — thank you' : 'Sent back with your notes');
      load(accountId);
    } catch (err) {
      error(err.message);
    }
  };

  if (!data) {
    return (
      <div className="portal" style={{ display: 'grid', placeItems: 'center', minHeight: '100%' }}>
        <div className="empty"><Wordmark height={26} /><p>Loading your delivery portal…</p></div>
      </div>
    );
  }

  const { account, projects, sprints, inFlight, milestones, approvals, releases, tickets, invoices } = data;
  const onTrack = milestones.filter((m) => !['At risk', 'Slipped'].includes(m.status)).length;
  const waiting = approvals.filter((a) => a.status !== 'Approved');

  return (
    <div className="portal">
      {preview && (
        <div className="portal-bar">
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Previewing
          </span>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={accountId ?? ''}
            onChange={(e) => { const id = Number(e.target.value); setAccountId(id); setData(null); load(id); }}
            aria-label="Account to preview"
          >
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="spacer" />
          <span className="chip"><Icon name="alert" size={12} />This is exactly what the client sees</span>
        </div>
      )}

      <header className="p-hero">
        <Wordmark height={22} invert={false} />
        <span className="eyebrow">Delivery portal · {account.name}</span>
        <h1>Here is exactly where your build stands.</h1>
        <p>
          Updated live from the Nuuke delivery floor. Everything below is pulled from the same boards
          our engineers work in — no re-typed status reports.
        </p>
        <div className="p-stats">
          <div className="p-stat"><div className="v">{projects.length}</div><div className="l">Active projects</div></div>
          <div className="p-stat"><div className="v">{onTrack}/{milestones.length}</div><div className="l">Milestones on track</div></div>
          <div className="p-stat"><div className="v">{waiting.length}</div><div className="l">Waiting on you</div></div>
          <div className="p-stat"><div className="v">{tickets.length}</div><div className="l">Open requests</div></div>
          <div className="p-stat"><div className="v">{releases[0] ? formatDay(releases[0].target_on) : '—'}</div><div className="l">Next release</div></div>
        </div>
        {!preview && (
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <button type="button" className="btn btn-sm" onClick={() => setRaising(true)}><Icon name="plus" />Raise a request</button>
            <button type="button" className="btn btn-sm" onClick={logout}><Icon name="logout" />Sign out</button>
          </div>
        )}
      </header>

      <div className="p-body">
        <section className="p-sec">
          <h2>Your projects</h2>
          <div className="p-list">
            {projects.map((p) => {
              const sprint = sprints.find((s) => s.project_id === p.id);
              return (
                <article className="p-item" key={p.id}>
                  <span className="nm">{p.name}</span>
                  <Pill label={p.status} color={COLORS.projectStatus[p.status] ?? '#C3C6D4'} />
                  <span className="rt">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 170 }}>
                      <span className="prog" style={{ width: 110 }}><i style={{ width: `${p.progress}%` }} /></span>
                      <span className="mono" style={{ fontSize: 11.5 }}>{p.progress}%</span>
                    </span>
                    <span className="chip">{formatDay(p.start_on)} → {formatDay(p.end_on)}</span>
                  </span>
                  {sprint && (
                    <p className="ds">
                      <b>Current sprint:</b> {sprint.name} — {sprint.goal} ({formatDay(sprint.start_on)}–{formatDay(sprint.end_on)})
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {sprints.length > 0 && (
          <section className="p-sec">
            <h2>In flight right now <span className="c">work your squad has picked up this sprint</span></h2>
            <div className="p-list">
              {sprints.map((s) => {
                const items = inFlight.filter((t) => t.sprint_id === s.id);
                return (
                  <article className="p-item" key={s.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="nm">{s.name}</span>
                      <span className="rt">
                        <span className="mono" style={{ fontSize: 12 }}>
                          {s.shipped_points} of {s.committed_points} points shipped
                        </span>
                      </span>
                    </div>
                    <div className="prog" style={{ height: 8 }}>
                      <i style={{ width: `${clamp((s.shipped_points / Math.max(s.committed_points, 1)) * 100, 0, 100)}%` }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {items.length === 0 ? (
                        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nothing has moved into development yet this sprint.</span>
                      ) : (
                        items.slice(0, 8).map((t) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, flexWrap: 'wrap' }}>
                            <Pill label={t.status} color={COLORS.taskStatus[t.status] ?? '#C3C6D4'} />
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                          </div>
                        ))
                      )}
                      {items.length > 8 && (
                        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>+ {items.length - 8} more tickets this sprint</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {waiting.length > 0 && (
          <section className="p-sec">
            <h2>Waiting on your sign-off</h2>
            <div className="p-list">
              {waiting.map((a) => {
                const late = a.due_on && daysUntil(a.due_on) < 0;
                return (
                  <article className="p-item" key={a.id}>
                    <span className="nm">{a.name}</span>
                    <Pill label={a.status} color={COLORS.approvalStatus[a.status] ?? '#C3C6D4'} />
                    <span className="rt">
                      <span className="mono" style={{ fontSize: 11.5, color: late ? 'var(--bad)' : 'var(--text-2)' }}>
                        needed by {formatDay(a.due_on)}
                      </span>
                      {!preview && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => respond(a, 'Changes requested')}>Ask for changes</button>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => respond(a, 'Approved')}>
                            <Icon name="check" />Approve
                          </button>
                        </>
                      )}
                    </span>
                    {a.note && <p className="ds">{a.note}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="p-sec">
          <h2>Milestones</h2>
          <div className="p-list">
            {milestones.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>No client-facing milestones set yet.</p>
            ) : (
              milestones.map((m) => (
                <article className="p-item" key={m.id}>
                  <span className="nm">{m.name}</span>
                  <Pill label={m.status} color={COLORS.milestoneStatus[m.status] ?? '#C3C6D4'} />
                  <span className="rt"><span className="mono" style={{ fontSize: 11.5 }}>{formatFullDay(m.due_on)}</span></span>
                  {m.note && <p className="ds">{m.note}</p>}
                </article>
              ))
            )}
          </div>
        </section>

        {releases.length > 0 && (
          <section className="p-sec">
            <h2>Coming to your users</h2>
            <div className="p-list">
              {releases.map((r) => (
                <article className="p-item" key={r.id}>
                  <span className="nm">{r.name}</span>
                  <Pill label={r.status} color={COLORS.releaseStatus[r.status] ?? '#C3C6D4'} />
                  <span className="rt">
                    <span className="chip">{r.platform}</span>
                    <span className="mono" style={{ fontSize: 11.5 }}>target {formatDay(r.target_on)}</span>
                  </span>
                  {r.notes && <p className="ds">{r.notes}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="p-sec">
          <h2>Your open requests <span className="c">tracked against your support SLA</span></h2>
          <div className="p-list">
            {tickets.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>Nothing open — every request you have raised is resolved.</p>
            ) : (
              tickets.map((t) => (
                <article className="p-item" key={t.id}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.key}</span>
                  <span className="nm">{t.subject}</span>
                  <Pill label={t.status} color={COLORS.ticketStatus[t.status] ?? '#C3C6D4'} />
                  <span className="rt">
                    <Pill label={t.priority} color={COLORS.priority[t.priority] ?? '#C3C6D4'} />
                    <SlaPill due={t.sla_due_at} />
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        {invoices.length > 0 && (
          <section className="p-sec">
            <h2>Billing</h2>
            <div className="p-list">
              {invoices.map((i) => (
                <article className="p-item" key={i.id}>
                  <span className="nm mono">{i.number}</span>
                  <Pill label={i.status} color={COLORS.invoiceStatus[i.status] ?? '#C3C6D4'} />
                  <span className="rt">
                    <span className="num" style={{ fontWeight: 700 }}>{moneyFull(i.amount)}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>due {formatDay(i.due_on)}</span>
                  </span>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <p className="p-note">
        {preview
          ? `Portal preview — this is the read-only view ${account.name} sees. Internal notes, costs, staffing, defect counts and backlog tickets are never exposed here.`
          : `Signed in as ${user.email}. Costs, staffing and internal tickets are not part of this view — ask your account manager if you need anything that is not here.`}
      </p>

      {raising && (
        <RaiseTicket
          onClose={() => setRaising(false)}
          onCreated={() => { setRaising(false); toast('Request raised'); load(); }}
        />
      )}
    </div>
  );
}
