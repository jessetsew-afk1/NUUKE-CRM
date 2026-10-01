import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Check, Dice5, Lock, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { rpc, supabase } from '@/lib/supabase';
import { Agent } from '@/agent/Agent';
import {
  BACKGROUNDS, HAIR_COLORS, LOCKED_ITEMS, OUTFIT_COLORS, SKINS, SLOTS, type AgentConfig, type Mood,
} from '@/agent/catalog';
import { Button, PageHeader, Panel, ProgressBar, spring, Switch } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { count, firstName } from '@/lib/format';

interface Progress { item_key: string; label: string; hint: string; threshold: number; progress: number; unlocked: boolean }

const MOODS: { value: Mood; label: string }[] = [
  { value: 'idle', label: 'Chill' }, { value: 'wave', label: 'Wave' }, { value: 'happy', label: 'Happy' },
  { value: 'focus', label: 'On a call' }, { value: 'celebrate', label: 'Celebrate' }, { value: 'sleepy', label: 'Break' },
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export default function AgentPage() {
  const { profile, agent, patchProfile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AgentConfig>(agent);
  const [slot, setSlot] = useState<(typeof SLOTS)[number]['key']>('hair');
  const [mood, setMood] = useState<Mood>('idle');
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(agent), [agent]);

  const progress = useQuery({
    queryKey: ['agent-progress', profile?.id],
    queryFn: async () => {
      await rpc('check_agent_unlocks');
      return rpc<Progress[]>('agent_progress', {});
    },
  });
  const unlocked = useMemo(() => new Set((progress.data ?? []).filter((p) => p.unlocked).map((p) => p.item_key)), [progress.data]);
  const progressByKey = useMemo(() => new Map((progress.data ?? []).map((p) => [p.item_key, p])), [progress.data]);
  const isLocked = (key: string) => LOCKED_ITEMS.has(key) && !unlocked.has(key);

  const dirty = JSON.stringify(draft) !== JSON.stringify(agent);
  const active = SLOTS.find((s) => s.key === slot)!;

  const randomize = () => {
    const next = { ...draft };
    for (const s of SLOTS) {
      const pool = s.items?.map((i) => i.id).filter((id) => !isLocked(`${s.key}:${id}`));
      if (pool?.length) (next as unknown as Record<string, unknown>)[s.key] = pick(pool);
    }
    next.skin = pick(Object.keys(SKINS).filter((k) => k.startsWith('s')));
    next.hairColor = pick(Object.keys(HAIR_COLORS));
    next.outfitColor = pick(Object.keys(OUTFIT_COLORS));
    next.bg = pick(Object.keys(BACKGROUNDS).filter((k) => !isLocked(`bg:${k}`)));
    next.cheeks = Math.random() > 0.4;
    setDraft(next);
    setMood('happy');
  };

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ avatar: draft as never }).eq('id', profile!.id);
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    patchProfile({ avatar: draft as never });
    void qc.invalidateQueries({ queryKey: ['people'] });
    void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    setMood('celebrate');
    celebrate();
    toast({ title: 'Looking sharp!', body: 'Your agent is updated everywhere.', tone: 'success' });
  };

  const set = (key: keyof AgentConfig, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <PageHeader title="My agent" sub={`Dress up your little agent, ${firstName(profile?.full_name)}. Everyone sees it next to your name.`} />

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        {/* the stage */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Panel strong className="relative overflow-hidden !p-6 text-center">
            <motion.div key={JSON.stringify(draft)} initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={spring} className="mx-auto w-fit">
              <Agent config={draft} size={300} mood={mood} />
            </motion.div>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {MOODS.map((m) => (
                <button key={m.value} type="button" onClick={() => setMood(m.value)}
                  className={clsx('h-8 rounded-full px-3 text-[12px] font-bold transition-colors', mood === m.value ? 'bg-[var(--btn)] text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]')}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-[auto_auto_1fr] gap-2">
              <Button variant="glass" icon={<Dice5 className="size-4" />} onClick={randomize}>Surprise me</Button>
              <Button variant="glass" icon={<RotateCcw className="size-4" />} onClick={() => setDraft(agent)} disabled={!dirty}>Undo</Button>
              <Button variant="primary" icon={<Save className="size-4" />} onClick={save} loading={busy} disabled={!dirty}>
                {dirty ? 'Save look' : 'Saved'}
              </Button>
            </div>
          </Panel>

          <Panel className="mt-5">
            <h3 className="mb-1 flex items-center gap-2 text-[15px] font-bold"><Sparkles className="size-4 text-iris" />Earn rare items</h3>
            <p className="text-2 mb-4 text-[13px]">Hit milestones to unlock them — just like a game.</p>
            <div className="space-y-3">
              {(progress.data ?? []).map((p) => (
                <div key={p.item_key}>
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {p.unlocked ? <Check className="size-4 text-ok" /> : <Lock className="text-3 size-3.5" />}
                      {p.label}
                    </span>
                    <span className="text-3 tabular text-[12px]">{p.unlocked ? 'Unlocked' : `${count(Math.min(p.progress, p.threshold))} / ${count(p.threshold)}`}</span>
                  </div>
                  <div className="text-3 mb-1 text-[12px]">{p.hint}</div>
                  <ProgressBar value={Math.min(p.progress, p.threshold)} max={p.threshold} height={6} glow={false} />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* the wardrobe */}
        <Panel className="min-w-0 !p-4 sm:!p-5">
          <div className="scroll-x no-scrollbar -mx-1 mb-4 flex gap-1.5 px-1 pb-1">
            {SLOTS.map((s) => (
              <button key={s.key} type="button" onClick={() => setSlot(s.key)}
                className={clsx('relative h-9 shrink-0 rounded-full px-4 text-[13px] font-bold', slot === s.key ? 'text-[color:var(--btn-text)]' : 'fill hover:bg-[var(--fill-2)]')}>
                {slot === s.key && <motion.span layoutId="wardrobe-tab" transition={spring} className="absolute inset-0 rounded-full bg-[var(--btn)]" />}
                <span className="relative">{s.label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={slot} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {active.colors === 'skin' && (
                <>
                  <SwatchRow label="Skin tone" options={Object.entries(SKINS).map(([k, v]) => ({ key: k, color: v.base, label: v.label }))} value={draft.skin} onPick={(k) => set('skin', k)} big />
                  <div className="mt-5"><Switch checked={draft.cheeks} onChange={(v) => set('cheeks', v)} label="Rosy cheeks" /></div>
                </>
              )}
              {active.colors === 'hair' && (
                <SwatchRow label="Hair colour" options={Object.entries(HAIR_COLORS).map(([k, v]) => ({ key: k, color: v.base, label: v.label }))} value={draft.hairColor} onPick={(k) => set('hairColor', k)} />
              )}
              {active.colors === 'outfit' && (
                <SwatchRow label="Outfit colour" options={Object.entries(OUTFIT_COLORS).map(([k, v]) => ({ key: k, color: v.base, label: v.label }))} value={draft.outfitColor} onPick={(k) => set('outfitColor', k)} />
              )}
              {active.colors === 'bg' && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                  {Object.entries(BACKGROUNDS).map(([k, v]) => {
                    const key = `bg:${k}`;
                    return (
                      <Tile key={k} label={v.label} selected={draft.bg === k} locked={isLocked(key)} hint={progressByKey.get(key)?.hint}
                        onClick={() => !isLocked(key) && set('bg', k)}>
                        <Agent config={{ ...draft, bg: k }} size={92} animated={false} />
                      </Tile>
                    );
                  })}
                </div>
              )}
              {active.items && (
                <div className={clsx('grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6', active.colors && active.colors !== 'bg' && 'mt-5')}>
                  {active.items.map((item) => {
                    const key = `${active.key}:${item.id}`;
                    const locked = isLocked(key);
                    return (
                      <Tile key={item.id} label={item.label} selected={draft[active.key] === item.id} locked={locked} hint={progressByKey.get(key)?.hint}
                        onClick={() => { if (!locked) { set(active.key, item.id); if (active.key === 'hat' && item.id === 'headset') setMood('focus'); } }}>
                        <Agent config={{ ...draft, [active.key]: item.id }} size={92} animated={false} />
                      </Tile>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Panel>
      </div>
    </>
  );
}

function SwatchRow({ label, options, value, onPick, big }: { label: string; options: { key: string; color: string; label: string }[]; value: string; onPick: (k: string) => void; big?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <motion.button
            key={o.key}
            type="button"
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.08 }}
            onClick={() => onPick(o.key)}
            title={o.label}
            aria-label={o.label}
            className={clsx('relative grid place-items-center rounded-full', big ? 'size-12' : 'size-10')}
            style={{ background: o.color, boxShadow: value === o.key ? '0 0 0 3px var(--canvas), 0 0 0 5.5px #7C5CFF' : 'inset 0 0 0 1px rgba(0,0,0,.08)' }}
          >
            {value === o.key && <Check className="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.5)]" />}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function Tile({ children, label, selected, locked, hint, onClick }: { children: React.ReactNode; label: string; selected: boolean; locked: boolean; hint?: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={locked ? { x: [0, -4, 4, 0] } : { scale: 0.94 }}
      whileHover={locked ? undefined : { y: -3 }}
      transition={spring}
      onClick={onClick}
      title={locked ? hint : label}
      className={clsx('relative flex flex-col items-center gap-1.5 rounded-[22px] p-2 pb-2.5', selected ? 'bg-iris/12' : 'fill hover:bg-[var(--fill-2)]')}
      style={selected ? { boxShadow: 'inset 0 0 0 2px #7C5CFF' } : undefined}
    >
      <div className={clsx(locked && 'opacity-40 grayscale')}>{children}</div>
      <span className="max-w-full truncate text-[12px] font-bold">{label}</span>
      {locked && (
        <span className="absolute inset-x-2 top-[38%] flex flex-col items-center rounded-2xl bg-[var(--glass-strong)] px-1.5 py-1 text-center shadow">
          <Lock className="size-3.5" />
          <span className="text-2 text-[10px] font-semibold leading-tight">{hint}</span>
        </span>
      )}
      {selected && (
        <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-iris text-white"><Check className="size-3" /></span>
      )}
    </motion.button>
  );
}
