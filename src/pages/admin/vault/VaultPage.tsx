import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Calculator, FileDown, FileSpreadsheet, Gauge, KeyRound, LayoutDashboard, Lock, Notebook, Settings, ShieldCheck, Users,
} from 'lucide-react';
import { lockVault, setPasscode, unlockVault, useVault, useVaultStatus, useVaultToken } from '@/data/vault';
import { Button, Empty, Input, PageHeader, Panel, Skeleton, Spinner } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { time } from '@/lib/format';
import { Ctx, PeriodBar, periodMonths, thisMonth, useKnownMonths, type Mode, type Period, type VaultCtx } from './parts';
import { Overview } from './Overview';
import { Statements } from './Statements';
import { MetricsTab, Glossary } from './Metrics';
import { Ledger } from './Ledger';
import { Numbers } from './Numbers';
import { Investors } from './Investors';
import { VaultSettings } from './VaultSettings';

const Exporter = lazy(() => import('./pdf'));

type Tab = 'overview' | 'statements' | 'metrics' | 'ledger' | 'numbers' | 'investors' | 'glossary' | 'settings';
const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'statements', label: 'Statements', icon: FileSpreadsheet },
  { id: 'metrics', label: 'Metrics & ratios', icon: Gauge },
  { id: 'ledger', label: 'Money in & out', icon: Calculator },
  { id: 'numbers', label: 'Monthly numbers', icon: Notebook },
  { id: 'investors', label: 'Investors', icon: Users },
  { id: 'glossary', label: 'Glossary', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function VaultPage() {
  const status = useVaultStatus();
  const token = useVaultToken();

  if (status.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (!status.data?.owner) {
    return (
      <Panel className="mx-auto mt-10 max-w-lg">
        <Empty art={<Lock className="size-10 text-iris" />} title="Private section"
          body="This area is only for the company owner's account." />
      </Panel>
    );
  }
  if (!status.data.has_passcode) return <SetPasscode />;
  if (!token) return <Unlock lockedUntil={status.data.locked_until ?? null} />;
  return <Vault />;
}

/* ================================================================== gate */
function GateCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <Panel strong className="w-full max-w-[420px] !p-7 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[linear-gradient(135deg,#7C5CFF,#5AB8FF)] text-white shadow-[0_12px_40px_-12px_rgba(124,92,255,.8)]">
          <ShieldCheck className="size-8" />
        </div>
        <h1 className="mt-5 text-[24px] font-extrabold">{title}</h1>
        <p className="text-2 mt-1.5 text-[14px]">{sub}</p>
        <div className="mt-6 text-left">{children}</div>
      </Panel>
    </div>
  );
}

function SetPasscode() {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const go = async () => {
    setErr(null);
    if (a.length < 6) return setErr('Use at least 6 characters.');
    if (a !== b) return setErr('The two passcodes are not the same.');
    setBusy(true);
    try {
      const r = await setPasscode(a);
      if (!r.ok) { setErr(r.error ?? 'Could not set it'); return; }
      await unlockVault(a);
      await qc.invalidateQueries({ queryKey: ['vault-status'] });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <GateCard title="Create your vault passcode" sub="Only you can set this. Anyone who gets into your account still needs it to open the finances.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <Input label="Passcode" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus />
        <Input label="Type it again" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} error={err} />
        <p className="text-3 text-[12px]">6 or more characters. Write it down somewhere safe: if it is lost it can only be reset directly in the database.</p>
        <Button type="submit" variant="iris" block size="lg" loading={busy} icon={<KeyRound className="size-4" />}>Set passcode & open</Button>
      </form>
    </GateCard>
  );
}

function Unlock({ lockedUntil }: { lockedUntil: string | null }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(lockedUntil);
  const locked = until && new Date(until) > new Date();
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await unlockVault(code);
      if (!r.ok) {
        setCode('');
        if (r.error === 'Locked') { setUntil(r.locked_until ?? null); setErr(null); }
        else setErr(r.tries_left != null ? `Wrong passcode. ${r.tries_left} ${r.tries_left === 1 ? 'try' : 'tries'} left before a 15-minute lock.` : r.error ?? 'Wrong passcode');
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <GateCard title="Finance vault" sub="Enter your passcode to open the company finances and investor accounts.">
      {locked ? (
        <div className="fill rounded-2xl p-4 text-center text-[14px]">
          Too many wrong tries. The vault is locked until <b>{time(until)}</b>.
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
          <Input label="Passcode" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus error={err} />
          <Button type="submit" variant="iris" block size="lg" loading={busy} disabled={!code} icon={<Lock className="size-4" />}>Unlock</Button>
          <p className="text-3 text-center text-[12px]">Locks itself after 30 idle minutes. Every attempt is logged.</p>
        </form>
      )}
    </GateCard>
  );
}

/* ================================================================= vault */
function Vault() {
  const v = useVault();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('nuuke.vault.tab') as Tab) || 'overview');
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('nuuke.vault.mode') as Mode) || 'simple');
  const [period, setPeriod] = useState<Period>({ preset: 'month', from: thisMonth(), to: thisMonth() });
  // Open on the latest month that has money in it (not an empty new month).
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    if (placed || !v.data) return;
    const latest = v.data.entries.map((e) => e.month).filter((m) => m <= thisMonth()).sort().pop();
    if (latest) setPeriod({ preset: 'month', from: latest, to: latest });
    setPlaced(true);
  }, [v.data, placed]);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { try { sessionStorage.setItem('nuuke.vault.tab', tab); } catch { /* */ } }, [tab]);
  useEffect(() => { try { localStorage.setItem('nuuke.vault.mode', mode); } catch { /* */ } }, [mode]);
  const knownMonths = useKnownMonths(v.data);
  const months = useMemo(() => periodMonths(period, knownMonths), [period, knownMonths]);

  if (v.isLoading || !v.data) {
    if (v.error) return <Panel className="mx-auto mt-10 max-w-lg"><Empty title="Could not open the vault" body={(v.error as Error).message} /></Panel>;
    return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  }
  const ctx: VaultCtx = { data: v.data, mode, period, months, setPeriod, setMode, knownMonths };
  const company = v.data.settings.company || 'NUUKE';

  return (
    <Ctx.Provider value={ctx}>
      <PageHeader eyebrow={<span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Private · only you</span>}
        title="Finance vault" sub={`${company}'s money, metrics and investor accounts, all worked out from what you enter.`}
        right={<>
          <Button variant="glass" icon={<FileDown className="size-4" />} onClick={() => setExporting(true)}>Company report PDF</Button>
          <Button variant="glass" icon={<Lock className="size-4" />} onClick={() => { void lockVault(); toast({ title: 'Vault locked' }); }}>Lock</Button>
        </>} />

      <div className="scroll-x no-scrollbar -mx-1 mb-4 flex gap-1.5 px-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={clsx('flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2 text-[13.5px] font-bold transition-colors',
              tab === t.id ? 'bg-iris text-white shadow-[0_8px_24px_-10px_rgba(124,92,255,.8)]' : 'glass text-2 hover:text-[color:var(--text)]')}>
            <t.icon className="size-4" />{t.label}
          </button>
        ))}
      </div>

      {tab !== 'glossary' && tab !== 'settings' && tab !== 'numbers' && <Panel className="mb-4 !p-3"><PeriodBar /></Panel>}

      {tab === 'overview' && <Overview />}
      {tab === 'statements' && <Statements />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'ledger' && <Ledger />}
      {tab === 'numbers' && <Numbers />}
      {tab === 'investors' && <Investors />}
      {tab === 'glossary' && <Glossary />}
      {tab === 'settings' && <VaultSettings />}

      {exporting && (
        <Suspense fallback={null}>
          <Exporter kind="company" ctx={ctx} onDone={() => setExporting(false)} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
