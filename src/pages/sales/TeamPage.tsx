/**
 * Team: every rep's calls and Zoom texts, for admins and sales leads. Totals up top,
 * then one card per rep; open a card for how their calls ended and their day-by-day.
 */
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { CalendarCheck, ChevronDown, Headphones, MessageSquareText, PhoneIncoming, Reply } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { OUTCOME_TONE } from '@/data/sales';
import { useTeamActivity, type TeamActivity } from '@/data/team';
import { BarList, ColumnChart } from '@/ui/charts';
import { Empty, PageHeader, Panel, PanelHeader, Pill, Segmented, Skeleton, Stat, toneColor } from '@/ui/kit';
import { addDaysISO, ago, count, localISO, pct } from '@/lib/format';
import type { Tone } from '@/ui/kit';

type Range = 'today' | 'yesterday' | 'week' | 'month';

const busyness = (r: TeamActivity) => r.dials + r.texts_sent;

export default function TeamPage() {
  const { profile } = useAuth();
  const allowed = profile?.role === 'admin' || !!profile?.is_sales_lead;
  const [range, setRange] = useState<Range>('today');
  const [open, setOpen] = useState<string | null>(null);
  const today = localISO();
  const [from, to] = useMemo(() => ({
    today: [today, today],
    yesterday: [addDaysISO(today, -1), addDaysISO(today, -1)],
    week: [addDaysISO(today, -6), today],
    month: [addDaysISO(today, -29), today],
  }[range]), [range, today]);
  const team = useTeamActivity(from, to, allowed);
  const rows = useMemo(() => [...(team.data ?? [])].sort((a, b) => busyness(b) - busyness(a) || a.full_name.localeCompare(b.full_name)), [team.data]);
  const sum = (k: keyof TeamActivity) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const dials = sum('dials');
  const connected = sum('connected');
  const textsSent = sum('texts_sent');
  const oneDay = from === to;

  if (!allowed) {
    return <Empty title="Only sales leads see the team" body="Ask an admin to turn on Sales lead for you in Team & access." />;
  }

  return (
    <>
      <PageHeader
        title="Team"
        sub="Every rep's calls and Zoom texts. Only admins and sales leads can see this page."
        right={<Segmented value={range} onChange={setRange} options={[
          { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' },
        ]} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Calls" value={team.data ? count(dials) : '–'} icon={<Headphones className="size-4" />} accent="#7C5CFF"
          sub={team.data ? `${rows.filter((r) => r.dials > 0).length} people dialling` : ' '} />
        <Stat label="Connected" value={team.data ? count(connected) : '–'} icon={<PhoneIncoming className="size-4" />} accent="#2FB98C"
          sub={dials ? `${pct(connected / dials)} pick-up rate` : ' '} />
        <Stat label="Meetings booked" value={team.data ? count(sum('meetings_booked')) : '–'} icon={<CalendarCheck className="size-4" />} accent="#F08A4B" sub=" " />
        <Stat label="Texts sent" value={team.data ? count(textsSent) : '–'} icon={<MessageSquareText className="size-4" />} accent="#0B5CFF"
          sub={team.data ? `${count(sum('texts_left'))} still to text` : ' '} />
        <Stat label="Text replies" value={team.data ? count(sum('texts_replied')) : '–'} icon={<Reply className="size-4" />} accent="#30C46C"
          sub={textsSent ? `${pct(sum('texts_replied') / textsSent)} of texts sent` : ' '} />
      </div>

      {team.isLoading ? <Skeleton className="h-64" /> : team.error ? (
        <Empty title="Couldn't load the team" body={(team.error as Error).message} />
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <RepCard key={r.profile_id} r={r} oneDay={oneDay} open={open === r.profile_id}
              onToggle={() => setOpen(open === r.profile_id ? null : r.profile_id)} />
          ))}
        </div>
      )}
      <p className="text-3 mt-4 text-[12px]">
        Days run on the company clock, the same days the dialer counts. Texts count when the rep ticks Texted (or Replied) on the Texts page.
      </p>
    </>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'muted' }) {
  return (
    <div className="min-w-0">
      <div className="text-3 text-[11.5px] font-semibold uppercase tracking-wide">{label}</div>
      <div className={clsx('tabular font-display text-[22px] font-extrabold leading-tight', tone === 'muted' && 'text-3')}>{value}</div>
      {sub && <div className="text-2 truncate text-[12px]">{sub}</div>}
    </div>
  );
}

function RepCard({ r, oneDay, open, onToggle }: { r: TeamActivity; oneDay: boolean; open: boolean; onToggle: () => void }) {
  const quiet = busyness(r) === 0;
  const target = oneDay && r.daily_target ? r.daily_target : null;
  return (
    <Panel className={clsx('!p-0 overflow-hidden', quiet && 'opacity-75')}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 p-4 text-left sm:p-5">
        <div className="flex w-[calc(100%-2.75rem)] min-w-0 items-center gap-3 sm:w-auto sm:min-w-[180px] sm:flex-1">
          <Agent config={normaliseAgent(r.avatar as never, r.profile_id)} size={40} animated={false} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-bold">{r.full_name}</span>
              {r.role === 'setter' && <Pill tone="iris">Setter</Pill>}
            </div>
            <div className="text-3 truncate text-[12px]">
              {r.last_call_at ? `Last call ${ago(r.last_call_at)}` : 'No calls yet'}
              {r.last_text_at ? ` · last text ${ago(r.last_text_at)}` : ''}
            </div>
          </div>
        </div>
        <div className="order-last grid w-full grid-cols-3 gap-4 sm:order-none sm:w-auto sm:flex-[2] sm:grid-cols-5">
          <Figure label="Calls" value={count(r.dials)} sub={target ? `of ${target} target` : undefined} tone={r.dials ? undefined : 'muted'} />
          <Figure label="Connected" value={count(r.connected)} sub={r.dials ? pct(r.connected / r.dials) : undefined} tone={r.connected ? undefined : 'muted'} />
          <Figure label="Meetings" value={count(r.meetings_booked)} tone={r.meetings_booked ? undefined : 'muted'} />
          <Figure label="Texts sent" value={count(r.texts_sent)} sub={r.texts_total ? `${count(r.texts_left)} left of ${count(r.texts_total)}` : 'No text kit'} tone={r.texts_sent ? undefined : 'muted'} />
          <Figure label="Replies" value={count(r.texts_replied)} sub={r.texts_opted_out ? `${r.texts_opted_out} opted out` : undefined} tone={r.texts_replied ? undefined : 'muted'} />
        </div>
        <ChevronDown className={clsx('text-3 ml-auto size-5 shrink-0 transition-transform sm:ml-0', open && 'rotate-180')} />
      </button>
      {open && <RepDetail r={r} oneDay={oneDay} />}
    </Panel>
  );
}

function RepDetail({ r, oneDay }: { r: TeamActivity; oneDay: boolean }) {
  const first = r.full_name.split(/\s+/)[0];
  return (
    <div className="grid gap-5 border-t border-[var(--hairline)] p-4 sm:p-5 lg:grid-cols-2">
      <div>
        <PanelHeader title="How the calls ended" sub={r.dials ? `${count(r.dials)} calls` : undefined} />
        {r.outcomes.length ? (
          <BarList rows={r.outcomes.map((o) => ({
            key: o.outcome ?? 'none', label: o.label, value: o.count,
            dot: toneColor[OUTCOME_TONE[o.tone] ?? ('neutral' as Tone)], sub: r.dials ? pct(o.count / r.dials) : '',
          }))} />
        ) : <p className="text-3 text-[13px]">No calls in this range.</p>}
      </div>
      <div className="space-y-5">
        {oneDay ? (
          <p className="text-3 text-[13px]">Pick 7 or 30 days to see {first}'s day-by-day.</p>
        ) : (
          <>
            <div>
              <PanelHeader title="Calls per day" />
              <ColumnChart height={160} ariaLabel={`${first}'s calls per day`}
                data={r.daily.map((d) => ({ key: d.date, label: d.date.slice(5), value: d.dials }))} />
            </div>
            {r.texts_total > 0 && (
              <div>
                <PanelHeader title="Texts sent per day" />
                <ColumnChart height={140} color="#0B5CFF" ariaLabel={`${first}'s texts per day`}
                  data={r.daily.map((d) => ({ key: d.date, label: d.date.slice(5), value: d.texts }))} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
