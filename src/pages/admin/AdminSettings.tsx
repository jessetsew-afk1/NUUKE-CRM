import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CalendarHeart, Plus, Save, Trash2 } from 'lucide-react';
import { useSettings } from '@/data/common';
import { must, supabase } from '@/lib/supabase';
import type { Holiday, Settings } from '@/lib/types';
import { Button, IconButton, Input, PageHeader, Panel, PanelHeader, Picker, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';

type Num = Exclude<{ [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings], undefined>;

export default function AdminSettings() {
  const settings = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (settings.data) setForm(settings.data); }, [settings.data]);

  if (!form) return <><PageHeader title="Rules & settings" /><Skeleton className="h-96 rounded-[26px]" /></>;
  const num = (k: Num) => ({ value: String(form[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value === '' ? 0 : Number(e.target.value) }) });
  const pctField = (k: Num) => ({ value: String(Math.round(Number(form[k]) * 100)), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) / 100 }) });
  const dirty = JSON.stringify(form) !== JSON.stringify(settings.data);

  const save = async () => {
    setBusy(true);
    const { id: _id, updated_at: _u, ...patch } = form;
    void _id; void _u;
    const { error } = await supabase.from('settings').update(patch).eq('id', true);
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'Rules saved', body: 'Payroll and attendance use them straight away.', tone: 'success' });
    void qc.invalidateQueries();
  };

  return (
    <>
      <PageHeader title="Rules & settings" sub="The rules behind attendance, payroll and the dialer. Every change is recorded in the activity log."
        right={<Button variant="primary" icon={<Save className="size-4" />} disabled={!dirty} loading={busy} onClick={save}>{dirty ? 'Save changes' : 'Saved'}</Button>} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Attendance" sub="How lateness is judged at the first sign-in of a shift" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Grace (min)" type="number" {...num('grace_minutes')} hint="on time" />
            <Input label="Short day up to (min)" type="number" {...num('short_day_max_minutes')} />
            <Input label="Half day up to (min)" type="number" {...num('half_day_max_minutes')} />
            <Input label="Short days that only warn" type="number" {...num('free_short_days')} />
            <Input label="Half days at half pay" type="number" {...num('reduced_half_days')} />
            <Input label="Break allowance (min)" type="number" {...num('break_allowance_minutes')} />
            <Input label="Auto sign-out after reminder (min)" type="number" {...num('signout_grace_minutes')} />
            <Input label="Alert me if not in after (min)" type="number" {...num('absent_alert_minutes')} />
            <Input label="Track attendance from" type="date" value={form.attendance_starts_on ?? ''} hint="go-live day"
              onChange={(e) => setForm({ ...form, attendance_starts_on: e.target.value || null })} />
          </div>
          <p className="text-3 mt-3 text-[12px]">
            Nobody is marked absent before {form.attendance_starts_on ?? 'the start date'}. Under {form.grace_minutes} min late is on time · up to {form.short_day_max_minutes} is a short day · up to {form.half_day_max_minutes} is a half day · later counts as absent.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title="Payroll" sub="Periods run from the cutoff day to the day before the next one" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Cutoff day" type="number" min={1} max={28} {...num('payroll_cutoff_day')} />
            <Picker label="Day's pay is salary ÷" value={form.daily_rate_basis} onChange={(v) => setForm({ ...form, daily_rate_basis: v })}
              options={[{ value: 'working_days', label: 'Scheduled working days' }, { value: 'calendar_30', label: '30' }]} />
            <Input label="USD → PKR rate" type="number" step="0.01" {...num('usd_to_pkr')} leading={<span className="text-[12px] font-bold">Rs</span>} />
          </div>
          <h4 className="mb-2 mt-5 text-[13px] font-bold">Sales targets</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Low line (% of target)" type="number" {...pctField('low_performance_ratio')} />
            <Input label="Salary paid below it (%)" type="number" {...pctField('low_performance_salary_factor')} />
            <Input label="Commission at 100%+ (%)" type="number" {...pctField('commission_rate')} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Dialer" sub="How follow-ups are scheduled" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Days until a follow-up" type="number" {...num('followup_gap_days')} />
            <Input label="Calls in a round" type="number" {...num('max_attempts')} />
            <Input label="Default daily dial target" type="number" {...num('default_daily_dials')} />
            <Input label="Closed leads come back after (days)" type="number" min={0} max={365} {...num('recycle_after_days')} hint="0 = never" />
          </div>
          <p className="text-3 mt-3 text-[12px]">
            A lead that is not reached comes back on the rep's next working day, up to {form.max_attempts} calls.
            {form.recycle_after_days > 0
              ? ` Every closed lead (not interested, no answer, wrong person…) returns to the same rep for a fresh round ${form.recycle_after_days} day${form.recycle_after_days === 1 ? '' : 's'} later, with the last round's result on the card.`
              : ' Closed leads stay closed until you recycle them from Leads & import.'}
            {' '}Do not call never comes back, and won deals are clients.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title="Company" sub="Also used in the reps' text and email ideas" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Company name" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            <Input label="Website" placeholder="nuuke.com" value={form.company_website ?? ''} onChange={(e) => setForm({ ...form, company_website: e.target.value || null })} />
            <Input className="sm:col-span-2" label="What we are, in a few words" hint="“We're …”" value={form.company_pitch}
              onChange={(e) => setForm({ ...form, company_pitch: e.target.value })} placeholder="a design and development studio" />
            <Input className="sm:col-span-2" label="Booking link for emails" placeholder="https://calendly.com/…" value={form.booking_link ?? ''}
              onChange={(e) => setForm({ ...form, booking_link: e.target.value || null })} />
            <Picker label="Timezone" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })}
              options={['Asia/Karachi', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'].map((t) => ({ value: t, label: t }))} />
          </div>
        </Panel>

        <Holidays />
      </div>
    </>
  );
}

function Holidays() {
  const qc = useQueryClient();
  const toast = useToast();
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const list = useQuery({ queryKey: ['holidays'], queryFn: async () => must(await supabase.from('holidays').select('*').order('day', { ascending: false })) as Holiday[] });
  const add = async () => {
    if (!day || !name.trim()) return;
    const { error } = await supabase.from('holidays').upsert({ day, name: name.trim() });
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    setDay(''); setName('');
    void qc.invalidateQueries({ queryKey: ['holidays'] });
  };
  const remove = async (d: string) => {
    await supabase.from('holidays').delete().eq('day', d);
    void qc.invalidateQueries({ queryKey: ['holidays'] });
  };
  return (
    <Panel>
      <PanelHeader title="Holidays" sub="Nobody is marked absent on these days" />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-[170px]" />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid ul-Fitr" className="min-w-[180px] flex-1" />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={add}>Add</Button>
      </div>
      <div className="space-y-1.5">
        {(list.data ?? []).map((h) => (
          <div key={h.day} className="fill flex items-center gap-3 rounded-2xl px-3.5 py-2 text-[13px]">
            <CalendarHeart className="size-4 text-iris" />
            <span className="tabular w-[120px] font-bold">{format(parseISO(h.day), 'EEE d MMM yyyy')}</span>
            <span className="flex-1">{h.name}</span>
            <IconButton label="Remove" onClick={() => void remove(h.day)} className="size-8"><Trash2 className="size-4" /></IconButton>
          </div>
        ))}
        {list.data?.length === 0 && <p className="text-3 text-[13px]">No holidays yet.</p>}
      </div>
    </Panel>
  );
}
