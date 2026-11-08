import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Archive, KeyRound, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { setPasscode, unlockVault, useVaultMutations } from '@/data/vault';
import { KINDS, KIND_ORDER, type Kind, type VCategory } from '@/lib/finance';
import { dateTime } from '@/lib/format';
import { Button, Input, Panel, PanelHeader, Picker, Pill, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { Def, useV } from './parts';

export function VaultSettings() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <General />
        <Passcode />
      </div>
      <Types />
      <AccessLog />
    </div>
  );
}

function General() {
  const { data } = useV();
  const { saveSettings } = useVaultMutations();
  const toast = useToast();
  const [f, setF] = useState({ company: '', pkr_rate: '', tax_rate: '', signatory: '', report_note: '' });
  useEffect(() => {
    const s = data.settings;
    setF({ company: s.company ?? 'NUUKE', pkr_rate: s.pkr_rate != null ? String(s.pkr_rate) : '280', tax_rate: s.tax_rate != null ? String(s.tax_rate) : '',
      signatory: s.signatory ?? '', report_note: s.report_note ?? '' });
  }, [data.settings]);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await saveSettings({ company: f.company.trim() || 'NUUKE', pkr_rate: Number(f.pkr_rate) || 280, tax_rate: f.tax_rate === '' ? undefined : Number(f.tax_rate),
        signatory: f.signatory.trim() || undefined, report_note: f.report_note.trim() || undefined });
      toast({ title: 'Settings saved', tone: 'success' });
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  return (
    <Panel>
      <PanelHeader title="Company & reports" sub="Used across the vault and printed on the PDF reports." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Company name" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        <Input label="Signed by (on reports)" placeholder="e.g. Jesse Lane, CEO" value={f.signatory} onChange={(e) => setF({ ...f, signatory: e.target.value })} />
        <Input label="PKR per 1 USD (default rate)" inputMode="decimal" value={f.pkr_rate} onChange={(e) => setF({ ...f, pkr_rate: e.target.value })}
          hint="Each PKR entry keeps the rate it was entered at." />
        <Input label="Planning tax rate %" inputMode="decimal" placeholder="e.g. 15" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })}
          hint="For the suggested tax reserve." />
      </div>
      <Textarea className="mt-3" label="Note printed at the bottom of every report (optional)" rows={2} value={f.report_note}
        onChange={(e) => setF({ ...f, report_note: e.target.value })} placeholder="e.g. Figures are unaudited management accounts. Questions: finance@nuuke.us" />
      <div className="mt-4 flex justify-end"><Button variant="iris" loading={busy} onClick={() => void go()}>Save</Button></div>
    </Panel>
  );
}

function Passcode() {
  const { data } = useV();
  const toast = useToast();
  const [f, setF] = useState({ old: '', a: '', b: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (f.a.length < 6) { toast({ title: 'Use at least 6 characters', tone: 'danger' }); return; }
    if (f.a !== f.b) { toast({ title: 'The new passcodes do not match', tone: 'danger' }); return; }
    setBusy(true);
    try {
      const r = await setPasscode(f.a, f.old);
      if (!r.ok) { toast({ title: r.error ?? 'Could not change it', tone: 'danger' }); return; }
      await unlockVault(f.a);
      setF({ old: '', a: '', b: '' });
      toast({ title: 'Passcode changed', body: 'Any other open session was locked.', tone: 'success' });
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  return (
    <Panel>
      <PanelHeader title={<span className="flex items-center gap-2"><KeyRound className="size-4" />Vault passcode</span>}
        sub={data.passcode_set_at ? `Last set ${dateTime(data.passcode_set_at)}` : undefined} />
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <Input label="Current passcode" type="password" autoComplete="current-password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="New passcode" type="password" autoComplete="new-password" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} />
          <Input label="New passcode again" type="password" autoComplete="new-password" value={f.b} onChange={(e) => setF({ ...f, b: e.target.value })} />
        </div>
        <p className="text-3 text-[12px]">Only your account can open the vault, and only with this passcode. Five wrong tries lock it for 15 minutes.</p>
        <div className="flex justify-end"><Button type="submit" variant="iris" loading={busy} disabled={!f.old || !f.a}>Change passcode</Button></div>
      </form>
    </Panel>
  );
}

function Types() {
  const { data } = useV();
  const { save, remove } = useVaultMutations();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('expense');
  const [name, setName] = useState('');
  const used = new Set(data.entries.map((e) => e.category_id));
  const list = data.categories.filter((c) => c.kind === kind).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const add = async () => {
    if (!name.trim()) return;
    try { await save('category', { kind, name: name.trim(), acquisition: kind === 'marketing' }); setName(''); } catch (e) { toast({ title: (e as Error).message.includes('duplicate') ? 'That type already exists' : (e as Error).message, tone: 'danger' }); }
  };
  const upd = (c: VCategory, patch: Partial<VCategory>) => save('category', { ...c, ...patch }).catch((e) => toast({ title: (e as Error).message, tone: 'danger' }));
  return (
    <Panel>
      <PanelHeader title="Types of money" sub="Name the kinds of income, expense, commission and tax you use. Every entry picks one, and statements break down by them." />
      <div className="flex flex-wrap items-end gap-2">
        <Picker className="w-[260px]" label="Kind" value={kind} onChange={(v) => setKind(v as Kind)} options={KIND_ORDER.map((k) => ({ value: k, label: KINDS[k].label }))} />
        <Input className="min-w-[220px] flex-1" label="New type" placeholder={`e.g. ${kind === 'tax' ? 'Property tax' : kind === 'commission' ? 'Account manager bonus' : kind === 'revenue' ? 'SEO retainers' : 'Office supplies'}`}
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
        <Button variant="iris" icon={<Plus className="size-4" />} onClick={() => void add()}>Add type</Button>
      </div>
      <p className="text-3 mt-2 text-[12px]">{KINDS[kind].plain}</p>
      <div className="mt-4 divide-y divide-[color:var(--hairline,rgba(127,127,127,.15))]">
        {list.map((c) => (
          <TypeRow key={c.id} c={c} used={used.has(c.id)} onSave={(p) => void upd(c, p)}
            onDelete={async () => { if (!confirm(`Delete "${c.name}"? Entries using it keep their amounts but lose the type.`)) return; await remove('category', c.id); }} />
        ))}
        {!list.length && <div className="text-3 py-4 text-[13px]">No types for this kind yet.</div>}
      </div>
    </Panel>
  );
}

function TypeRow({ c, used, onSave, onDelete }: { c: VCategory; used: boolean; onSave: (p: Partial<VCategory>) => void; onDelete: () => void }) {
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);
  const counts = ['marketing', 'commission', 'salary', 'software', 'expense'].includes(c.kind);
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 py-2.5', c.archived && 'opacity-55')}>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== c.name) onSave({ name: name.trim() }); }}
        className="fill h-9 min-w-[200px] flex-1 rounded-xl px-3 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-iris" />
      {counts && (
        <label className="text-2 flex items-center gap-2 text-[12.5px] font-semibold">
          <Switch checked={c.kind === 'marketing' || c.acquisition} onChange={(v) => onSave({ acquisition: v })} />
          Counts toward CAC <Def text="Turn on for costs spent winning new clients (sales salaries, setter commissions, dialer tools). They go into Customer Acquisition Cost. All marketing counts automatically." />
        </label>
      )}
      {used && <Pill tone="neutral">in use</Pill>}
      <Button size="sm" variant="ghost" icon={c.archived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />} onClick={() => onSave({ archived: !c.archived })}>{c.archived ? 'Restore' : 'Hide'}</Button>
      {!used && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>Delete</Button>}
    </div>
  );
}

function AccessLog() {
  const { data } = useV();
  return (
    <Panel>
      <PanelHeader title="Access log" sub="The last 30 tries to open or change the vault, from any account" />
      <div className="divide-y divide-[color:var(--hairline,rgba(127,127,127,.15))] text-[13.5px]">
        {data.log.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-2"><i className={clsx('size-2 rounded-full', l.ok ? 'bg-ok' : 'bg-bad')} />{l.event}</span>
            <span className="text-3 whitespace-nowrap text-[12.5px]">{l.email ?? 'unknown'} · {dateTime(l.at)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
