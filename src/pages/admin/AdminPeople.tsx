import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Dice5, KeyRound, Plus, Power, Search, Target, Wallet } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { usePeopleAdmin, type Person } from '@/data/admin';
import { adminUsers, supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';
import { Agent } from '@/agent/Agent';
import { normaliseAgent } from '@/agent/catalog';
import { Button, Input, Label, PageHeader, Panel, Picker, Pill, Segmented, Sheet, Skeleton, Switch, type Tone } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago, count, localISO, pkr, usd } from '@/lib/format';

const ROLE: Record<Role, { label: string; tone: Tone; hint: string }> = {
  admin: { label: 'Admin', tone: 'great', hint: 'Everything, including logins, pay and leads' },
  sales: { label: 'Sales', tone: 'info', hint: 'Dialer, their own leads, pipeline and numbers' },
  production: { label: 'Production', tone: 'good', hint: 'Developers, designers, marketing' },
  client: { label: 'Client', tone: 'warn', hint: 'Their own project portal only' },
};
const DEPTS = ['sales', 'development', 'design', 'marketing', 'management', 'operations'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtShift = (start?: string | null, mins?: number | null) => {
  if (!start) return '—';
  const [h, m] = start.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  const end = new Date(d.getTime() + (mins ?? 540) * 60_000);
  const f = (x: Date) => x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${f(d)} – ${f(end)}`;
};

export default function AdminPeople() {
  const people = usePeopleAdmin();
  const [tab, setTab] = useState<'all' | Role | 'off'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const list = useMemo(() => (people.data ?? []).filter((p) => {
    if (tab === 'off') return !p.is_active;
    if (tab !== 'all' && p.role !== tab) return false;
    if (tab !== 'all' && !p.is_active) return false;
    const t = q.trim().toLowerCase();
    return !t || p.full_name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t) || (p.title ?? '').toLowerCase().includes(t);
  }), [people.data, tab, q]);

  const n = (r: Role) => (people.data ?? []).filter((p) => p.role === r && p.is_active).length;

  return (
    <>
      <PageHeader title="Team & access" sub="Create logins, set roles, shifts, salaries and targets. Changes take effect immediately."
        right={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add person</Button>} />

      <Panel className="mb-5 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'all', label: 'Everyone' }, { value: 'sales', label: `Sales ${n('sales')}` }, { value: 'production', label: `Production ${n('production')}` },
            { value: 'admin', label: `Admins ${n('admin')}` }, { value: 'client', label: `Clients ${n('client')}` }, { value: 'off', label: 'Switched off' },
          ]} />
          <Input className="min-w-[200px] flex-1" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        </div>
      </Panel>

      {people.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-[26px]" />)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <motion.button key={p.id} type="button" onClick={() => setEditing(p)}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
              className={clsx('glass rounded-[26px] p-5 text-left', !p.is_active && 'opacity-55')}>
              <div className="flex items-start gap-3">
                <Agent config={normaliseAgent(p.avatar, p.id)} size={56} animated={false} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-extrabold">{p.full_name}</div>
                  <div className="text-2 truncate text-[13px]">{p.title ?? '—'}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone={ROLE[p.role].tone}>{ROLE[p.role].label}</Pill>
                    {p.department && <Pill tone="neutral">{p.department}</Pill>}
                    {p.is_technical_manager && <Pill tone="iris">Tech manager</Pill>}
                    {!p.is_active && <Pill tone="bad" solid>Off</Pill>}
                  </div>
                </div>
              </div>
              <div className="text-2 mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                {p.role !== 'client' && <span className="flex items-center gap-1.5"><Clock className="size-3.5" />{p.employment?.tracks_attendance ? fmtShift(p.employment.shift_start, p.employment.shift_minutes) : 'Not tracked'}</span>}
                {p.role !== 'client' && <span className="flex items-center gap-1.5"><Wallet className="size-3.5" />{p.employment?.monthly_salary_pkr ? pkr(p.employment.monthly_salary_pkr) : '—'}</span>}
                {p.role === 'sales' && <span className="flex items-center gap-1.5"><Target className="size-3.5" />{usd(p.employment?.monthly_target_usd)} / month</span>}
                {p.role === 'sales' && <span className="flex items-center gap-1.5"><Target className="size-3.5" />{count(p.employment?.daily_dial_target)} dials / day</span>}
                <span className="text-3 col-span-2 truncate">{p.email} · {p.last_login ? `seen ${ago(p.last_login)}` : 'never signed in'}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <PersonSheet person={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/* ================================================================ editor */
interface Form {
  full_name: string; email: string; role: Role; department: string; title: string; phone: string; password: string;
  salary: string; tracks: boolean; shift_start: string; shift_hours: string; work_days: number[]; dial_target: string;
  target_usd: string; joined_on: string; active: boolean; tm: boolean;
}

const genPassword = () => {
  const words = ['Nova', 'Pixel', 'Orbit', 'Mango', 'Comet', 'Lotus', 'Tiger', 'Cloud', 'Spark', 'Delta'];
  const a = new Uint32Array(3);
  crypto.getRandomValues(a);
  return `${words[a[0] % words.length]}-${words[a[1] % words.length]}-${1000 + (a[2] % 9000)}`;
};

function PersonSheet({ person, onClose }: { person: Person | 'new' | null; onClose: () => void }) {
  const isNew = person === 'new';
  const p = person && person !== 'new' ? person : null;
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const k = p?.id ?? (isNew ? 'new' : null);

  if (k !== key) {
    setKey(k);
    const e = p?.employment;
    setForm(k ? {
      full_name: p?.full_name ?? '', email: p?.email ?? '', role: p?.role ?? 'sales', department: p?.department ?? 'sales',
      title: p?.title ?? '', phone: p?.phone ?? '', password: isNew ? genPassword() : '',
      salary: e?.monthly_salary_pkr ? String(e.monthly_salary_pkr) : '', tracks: e?.tracks_attendance ?? true,
      shift_start: (e?.shift_start ?? '18:00').slice(0, 5), shift_hours: String((e?.shift_minutes ?? 540) / 60),
      work_days: e?.work_days ?? [1, 2, 3, 4, 5], dial_target: String(e?.daily_dial_target ?? 250),
      target_usd: e?.monthly_target_usd ? String(e.monthly_target_usd) : '', joined_on: e?.joined_on ?? localISO(),
      active: p?.is_active ?? true, tm: p?.is_technical_manager ?? false,
    } : null);
  }
  if (!form) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const set = <K extends keyof Form>(k2: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k2]: v } : f));
  const staff = form.role !== 'client';

  const employment = () => ({
    monthly_salary_pkr: Number(form.salary.replace(/[^\d.]/g, '')) || 0,
    tracks_attendance: form.tracks,
    shift_start: form.shift_start,
    shift_minutes: Math.round(Number(form.shift_hours) * 60) || 540,
    work_days: form.work_days.sort(),
    daily_dial_target: Number(form.dial_target) || 0,
    monthly_target_usd: Number(form.target_usd.replace(/[^\d.]/g, '')) || 0,
    joined_on: form.joined_on || null,
  });

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) {
        const created = await adminUsers<{ id?: string }>({
          action: 'create', email: form.email, password: form.password, full_name: form.full_name, role: form.role,
          department: form.department || null, title: form.title || null, phone: form.phone || null, employment: staff ? employment() : undefined,
        });
        if (staff && form.tm && created.id) {
          const { error } = await supabase.from('profiles').update({ is_technical_manager: true }).eq('id', created.id);
          if (error) throw new Error(error.message);
        }
        toast({ title: `${form.full_name} can sign in now`, body: `${form.email} · password ${form.password}`, tone: 'success', duration: 12000 });
      } else if (p) {
        const changes: Record<string, unknown> = {};
        if (form.full_name !== p.full_name) changes.full_name = form.full_name;
        if (form.email !== p.email) changes.email = form.email;
        if (form.role !== p.role) changes.role = form.role;
        if (form.department !== (p.department ?? '')) changes.department = form.department || null;
        if (form.title !== (p.title ?? '')) changes.title = form.title || null;
        if (Object.keys(changes).length) await adminUsers({ action: 'update', user_id: p.id, ...changes });
        if (form.phone !== (p.phone ?? '')) await supabase.from('profiles').update({ phone: form.phone || null }).eq('id', p.id);
        const tm = staff && form.tm;
        if (tm !== p.is_technical_manager) {
          const { error } = await supabase.from('profiles').update({ is_technical_manager: tm }).eq('id', p.id);
          if (error) throw new Error(error.message);
        }
        if (staff) {
          const { error } = await supabase.from('employment').upsert({ profile_id: p.id, ...employment() });
          if (error) throw new Error(error.message);
        }
        if (form.password) await adminUsers({ action: 'reset_password', user_id: p.id, password: form.password });
        if (form.active !== p.is_active) await adminUsers({ action: 'set_active', user_id: p.id, active: form.active });
        toast({ title: 'Saved', body: form.password ? `New password: ${form.password}` : undefined, tone: 'success', duration: form.password ? 12000 : 3000 });
      }
      void qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!person} onClose={onClose} width={720} title={isNew ? 'Add a person' : form.full_name}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{isNew ? 'Create login' : 'Save changes'}</Button></>}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-iris">Account</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Full name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus={isNew} />
            <Input label="Email (their username)" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <Picker label="Role" value={form.role} onChange={(v) => setForm((f) => f && ({ ...f, role: v, department: v === 'sales' ? 'sales' : v === 'admin' ? 'management' : f.department }))}
              options={(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label, hint: ROLE[r].hint }))} disabled={p?.id === profile?.id} />
            {staff && (
              <Picker label="Department" value={form.department} onChange={(v) => set('department', v)}
                options={DEPTS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))} />
            )}
            <Input label="Job title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sales Executive" />
            <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            {staff && (
              <div className="fill flex items-center justify-between gap-4 rounded-[18px] p-3.5 sm:col-span-2">
                <div>
                  <div className="text-[14px] font-bold">Technical manager</div>
                  <div className="text-2 text-[13px]">Reps can put them on client meetings. They see those meetings, with the lead and the rep's prep, in “Client meetings”.</div>
                </div>
                <Switch checked={form.tm} onChange={(v) => set('tm', v)} />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label hint={isNew ? 'share it with them — they can keep it' : 'leave blank to keep their current password'}>{isNew ? 'Password' : 'Reset password'}</Label>
              <div className="flex gap-2">
                <input className="field font-mono" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isNew ? '' : 'New password'} />
                <Button variant="glass" icon={<Dice5 className="size-4" />} onClick={() => set('password', genPassword())}>Generate</Button>
              </div>
            </div>
          </div>
        </section>

        {staff && (
          <section>
            <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-iris">Shift & pay</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Monthly salary (PKR)" inputMode="numeric" value={form.salary} onChange={(e) => set('salary', e.target.value)} leading={<span className="text-[12px] font-bold">Rs</span>} />
              <Input label="Shift starts" type="time" value={form.shift_start} onChange={(e) => set('shift_start', e.target.value)} />
              <Input label="Shift length (hours, incl. break)" type="number" min={1} max={16} step={0.5} value={form.shift_hours} onChange={(e) => set('shift_hours', e.target.value)} />
            </div>
            <div className="mt-3">
              <Label>Working days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => {
                  const on = form.work_days.includes(i + 1);
                  return (
                    <button key={d} type="button" onClick={() => set('work_days', on ? form.work_days.filter((x) => x !== i + 1) : [...form.work_days, i + 1])}
                      className={clsx('h-9 w-12 rounded-xl text-[13px] font-bold', on ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill')}>{d}</button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input label="Joined on" type="date" value={form.joined_on} onChange={(e) => set('joined_on', e.target.value)} />
              <div className="flex items-end pb-2"><Switch checked={form.tracks} onChange={(v) => set('tracks', v)} label="Track attendance & deductions" /></div>
            </div>
          </section>
        )}

        {form.role === 'sales' && (
          <section>
            <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-iris">Targets</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Numbers to dial per day" type="number" value={form.dial_target} onChange={(e) => set('dial_target', e.target.value)} />
              <Input label="Monthly closing target (USD)" inputMode="numeric" value={form.target_usd} onChange={(e) => set('target_usd', e.target.value)} leading={<span className="text-[13px] font-bold">$</span>} />
            </div>
            <p className="text-3 mt-2 text-[12px]">≤ 30% of target → 30% of salary · 30–100% → full salary · 100%+ → full salary + 25% commission (adjust in Rules & settings).</p>
          </section>
        )}

        {!isNew && p?.id !== profile?.id && (
          <section className="fill flex items-center justify-between gap-4 rounded-[22px] p-4">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-bold"><Power className="size-4" />Login switched {form.active ? 'on' : 'off'}</div>
              <div className="text-2 text-[13px]">Switching it off signs them out everywhere at once. Their history is kept.</div>
            </div>
            <Switch checked={form.active} onChange={(v) => set('active', v)} />
          </section>
        )}
        {!isNew && <p className="text-3 flex items-center gap-1.5 text-[12px]"><KeyRound className="size-3.5" />Passwords are never shown or stored in plain text; resetting one replaces it.</p>}
      </div>
    </Sheet>
  );
}
