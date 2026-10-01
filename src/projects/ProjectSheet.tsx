import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Crown, Dice5, Plus, UserPlus } from 'lucide-react';
import { usePeople } from '@/data/common';
import { PROJECT_COLORS, PROJECT_STATUSES, type ProjectWithTeam } from '@/data/projects';
import { adminUsers, must, supabase } from '@/lib/supabase';
import type { Profile, Project } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Input, Label, Picker, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { localISO } from '@/lib/format';

const genPassword = () => {
  const words = ['Nova', 'Pixel', 'Orbit', 'Mango', 'Comet', 'Lotus', 'Tiger', 'Cloud', 'Spark', 'Delta'];
  const a = new Uint32Array(3);
  crypto.getRandomValues(a);
  return `${words[a[0] % words.length]}-${words[a[1] % words.length]}-${1000 + (a[2] % 9000)}`;
};

interface Form {
  name: string; client_name: string; service: string; description: string; color: string; status: string;
  starts_on: string; due_on: string; archived: boolean;
}

/** The admin's project editor: details, the team (and its lead), and the client logins. */
export function ProjectSheet({ project, onClose, onSaved }: { project: ProjectWithTeam | 'new' | null; onClose: () => void; onSaved?: (id: number) => void }) {
  const isNew = project === 'new';
  const p = project && project !== 'new' ? project : null;
  const people = usePeople();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const [leads, setLeads] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState<{ full_name: string; email: string; password: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const k = p ? `p${p.id}` : isNew ? 'new' : null;
  if (k !== key) {
    setKey(k);
    setNewClient(null);
    setForm(k ? {
      name: p?.name ?? '', client_name: p?.client_name ?? '', service: p?.service ?? '', description: p?.description ?? '',
      color: p?.color ?? PROJECT_COLORS[Math.floor(Math.random() * 5)], status: p?.status ?? 'active',
      starts_on: p?.starts_on ?? localISO(), due_on: p?.due_on ?? '', archived: !!p?.archived_at,
    } : null);
    setTeam(p?.members.filter((m) => m.profile?.role !== 'client').map((m) => m.profile_id) ?? []);
    setLeads(p?.members.filter((m) => m.is_lead).map((m) => m.profile_id) ?? []);
    setClients(p?.members.filter((m) => m.profile?.role === 'client').map((m) => m.profile_id) ?? []);
  }

  const staff = useMemo(() => (people.data ?? []).filter((x) => x.is_active && x.role !== 'client')
    .sort((a, b) => (a.role === 'production' ? 0 : 1) - (b.role === 'production' ? 0 : 1) || a.full_name.localeCompare(b.full_name)), [people.data]);
  const clientLogins = useMemo(() => (people.data ?? []).filter((x) => x.is_active && x.role === 'client'), [people.data]);

  if (!form) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const set = <K extends keyof Form>(f: K, v: Form[K]) => setForm((x) => (x ? { ...x, [f]: v } : x));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const createClient = async () => {
    if (!newClient) return;
    if (!newClient.full_name.trim() || !/\S+@\S+\.\S+/.test(newClient.email)) { toast({ title: 'Add their name and email', tone: 'warning' }); return; }
    setCreating(true);
    try {
      const res = await adminUsers<{ id?: string }>({
        action: 'create', email: newClient.email.trim(), password: newClient.password, full_name: newClient.full_name.trim(),
        role: 'client', title: form.client_name.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['people'] });
      const fresh = must(await supabase.from('profiles').select('id').eq('email', newClient.email.trim().toLowerCase()).maybeSingle()) as Pick<Profile, 'id'> | null;
      const id = res.id ?? fresh?.id;
      if (id) setClients((c) => [...new Set([...c, id])]);
      toast({ title: `${newClient.full_name} can sign in now`, body: `${newClient.email} · password ${newClient.password}`, tone: 'success', duration: 15000 });
      setNewClient(null);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setCreating(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Give the project a name', tone: 'warning' }); return; }
    setBusy(true);
    try {
      const row = {
        name: form.name.trim(), client_name: form.client_name.trim() || null, service: form.service.trim() || null,
        description: form.description.trim() || null, color: form.color, status: form.status,
        starts_on: form.starts_on || null, due_on: form.due_on || null,
        archived_at: form.archived ? p?.archived_at ?? new Date().toISOString() : null,
      };
      const saved = (p
        ? must(await supabase.from('projects').update(row).eq('id', p.id).select().single())
        : must(await supabase.from('projects').insert(row).select().single())) as Project;

      const want = new Map<string, boolean>([...team.map((id) => [id, leads.includes(id)] as const), ...clients.map((id) => [id, false] as const)]);
      const have = new Map((p?.members ?? []).map((m) => [m.profile_id, m.is_lead]));
      const gone = [...have.keys()].filter((id) => !want.has(id));
      const changed = [...want].filter(([id, lead]) => have.get(id) !== lead);
      if (gone.length) must(await supabase.from('project_members').delete().eq('project_id', saved.id).in('profile_id', gone).select());
      if (changed.length) {
        must(await supabase.from('project_members')
          .upsert(changed.map(([profile_id, is_lead]) => ({ project_id: saved.id, profile_id, is_lead })), { onConflict: 'project_id,profile_id' })
          .select());
      }
      if (isNew) celebrate('small');
      toast({ title: isNew ? `${saved.name} is set up` : 'Project saved', body: isNew && changed.length ? 'Everyone on it has been notified.' : undefined, tone: 'success' });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['p', saved.id] });
      onClose();
      onSaved?.(saved.id);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!project} onClose={onClose} width={760} title={isNew ? 'New project' : `Edit ${p?.name}`}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{isNew ? 'Create project' : 'Save'}</Button></>}>
      <div className="space-y-7">
        <section>
          <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-iris">The project</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Project name" autoFocus={isNew} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Halcyon patient app" />
            <Input label="Client (company)" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="e.g. Halcyon Health" />
            <Input label="Service" value={form.service} onChange={(e) => set('service', e.target.value)} placeholder="e.g. Mobile App Development" />
            <Picker label="Status" value={form.status} onChange={(v) => set('status', v)} options={PROJECT_STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
            <Input label="Starts" type="date" value={form.starts_on} onChange={(e) => set('starts_on', e.target.value)} />
            <Input label="Due" type="date" value={form.due_on} onChange={(e) => set('due_on', e.target.value)} />
            <Textarea className="sm:col-span-2" label="What we're making" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            <div className="sm:col-span-2">
              <Label>Colour</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => set('color', c)} aria-label={c}
                    className={clsx('grid size-9 place-items-center rounded-full transition-transform', form.color === c ? 'scale-110 ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--canvas)]' : 'hover:scale-105')}
                    style={{ background: c }}>
                    {form.color === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-extrabold uppercase tracking-wider text-iris">The team</h3>
          <p className="text-2 mb-3 text-[13px]">Tap people to put them on the project. Tap the crown to make someone the project lead.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {staff.map((x) => {
              const on = team.includes(x.id);
              const lead = leads.includes(x.id);
              return (
                <div key={x.id} className={clsx('flex items-center gap-3 rounded-[18px] p-2 pr-3 transition-colors', on ? 'bg-iris/12 ring-1 ring-iris/40' : 'fill hover:bg-[var(--fill-2)]')}>
                  <button type="button" onClick={() => { setTeam((t) => toggle(t, x.id)); if (on) setLeads((l) => l.filter((y) => y !== x.id)); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <AgentAvatar who={x} size={38} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold">{x.full_name}</span>
                      <span className="text-3 block truncate text-[12px]">{x.title ?? x.department ?? x.role}</span>
                    </span>
                  </button>
                  {on && (
                    <button type="button" onClick={() => setLeads((l) => toggle(l, x.id))} title={lead ? 'Project lead' : 'Make project lead'}
                      className={clsx('grid size-8 place-items-center rounded-full', lead ? 'bg-lemon text-ink' : 'text-3 hover:bg-[var(--fill-2)]')}>
                      <Crown className="size-4" />
                    </button>
                  )}
                  <span className={clsx('grid size-6 place-items-center rounded-full', on ? 'bg-iris text-white' : 'fill-2')}>{on && <Check className="size-3.5" />}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-extrabold uppercase tracking-wider text-iris">Client logins</h3>
          <p className="text-2 mb-3 text-[13px]">They'll see this project's portal: shared tasks, things to review, the calendars and messages. Nothing internal.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {clientLogins.map((x) => {
              const on = clients.includes(x.id);
              return (
                <button key={x.id} type="button" onClick={() => setClients((c) => toggle(c, x.id))}
                  className={clsx('flex items-center gap-3 rounded-[18px] p-2 pr-3 text-left transition-colors', on ? 'bg-warn/12 ring-1 ring-warn/50' : 'fill hover:bg-[var(--fill-2)]')}>
                  <AgentAvatar who={x} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{x.full_name}</span>
                    <span className="text-3 block truncate text-[12px]">{x.title ? `${x.title} · ` : ''}{x.email}</span>
                  </span>
                  <span className={clsx('grid size-6 place-items-center rounded-full', on ? 'bg-warn text-white' : 'fill-2')}>{on && <Check className="size-3.5" />}</span>
                </button>
              );
            })}
            {!newClient && (
              <button type="button" onClick={() => setNewClient({ full_name: '', email: '', password: genPassword() })}
                className="flex items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-[var(--hairline)] p-3 text-[14px] font-bold hover:bg-[var(--fill)]">
                <UserPlus className="size-4" /> New client login
              </button>
            )}
          </div>
          <AnimatePresence>
            {newClient && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="fill mt-3 grid gap-3 rounded-[22px] p-4 sm:grid-cols-2">
                  <Input label="Their name" value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} />
                  <Input label="Their email (username)" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                  <div className="sm:col-span-2">
                    <Label hint="share it with them — they can keep it">Password</Label>
                    <div className="flex gap-2">
                      <input className="field font-mono" value={newClient.password} onChange={(e) => setNewClient({ ...newClient, password: e.target.value })} />
                      <Button variant="glass" icon={<Dice5 className="size-4" />} onClick={() => setNewClient({ ...newClient, password: genPassword() })}>New</Button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <Button variant="ghost" onClick={() => setNewClient(null)}>Cancel</Button>
                    <Button variant="primary" icon={<Plus className="size-4" />} loading={creating} onClick={createClient}>Create login & add</Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {!isNew && (
          <section className="fill flex items-center justify-between gap-4 rounded-[22px] p-4">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-bold"><Archive className="size-4" />Archived</div>
              <div className="text-2 text-[13px]">Archived projects drop off everyone's workspace. Nothing is deleted.</div>
            </div>
            <Switch checked={form.archived} onChange={(v) => set('archived', v)} />
          </section>
        )}
      </div>
    </Sheet>
  );
}
