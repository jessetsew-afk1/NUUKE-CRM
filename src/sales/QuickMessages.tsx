import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { must, rpc, supabase } from '@/lib/supabase';
import type { Lead, QuickMessage } from '@/lib/types';
import { useToast } from '@/ui/toast';
import { Button, Spinner } from '@/ui/kit';
import { copyText } from './LeadCard';

/** Words a rep can drop into a quick message; filled in for whichever lead is on screen. */
const PLACEHOLDERS = [
  { tag: '{first name}', hint: 'Elizabeth' },
  { tag: '{my name}', hint: 'your first name' },
  { tag: '{company}', hint: 'NUUKE' },
  { tag: '{service}', hint: 'what they asked for' },
] as const;

export function fillQuick(body: string, v: { first: string; full: string; me: string; company: string; service: string }) {
  return body
    .replace(/\{\s*first[\s_-]*name\s*\}/gi, v.first)
    .replace(/\{\s*(?:full[\s_-]*)?name\s*\}/gi, v.full || v.first)
    .replace(/\{\s*my[\s_-]*name\s*\}/gi, v.me)
    .replace(/\{\s*company\s*\}/gi, v.company)
    .replace(/\{\s*service\s*\}/gi, v.service);
}

const firstOf = (n: string | null | undefined) => {
  const f = (n ?? '').trim().split(/\s+/)[0] ?? '';
  return f && !/[@\d]/.test(f) ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : 'there';
};

function useQuickMessages() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['quick-messages', session?.user.id],
    enabled: !!session,
    queryFn: async () => must(await supabase.from('quick_messages').select('*').order('position').order('id')) as QuickMessage[],
  });
}

/**
 * The rep's own saved messages. They write them once, then copy them onto any lead;
 * {first name} and friends are filled in for the lead on screen.
 */
export function QuickMessages({ lead, company }: { lead: Lead; company: string }) {
  const { profile } = useAuth();
  const list = useQuickMessages();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const key = ['quick-messages', profile?.id];
  const vars = {
    first: firstOf(lead.name),
    full: (lead.name ?? '').trim(),
    me: firstOf(profile?.full_name),
    company,
    service: (lead.service ?? '').trim().toLowerCase() || 'your project',
  };
  const items = list.data ?? [];

  const save = useMutation({
    mutationFn: async (m: { id?: number; title: string; body: string }) => {
      if (m.id) return must(await supabase.from('quick_messages').update({ title: m.title, body: m.body }).eq('id', m.id).select().single());
      const position = items.length ? Math.max(...items.map((x) => x.position)) + 1 : 0;
      return must(await supabase.from('quick_messages').insert({ title: m.title, body: m.body, position }).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ title: 'Could not save', body: e.message, tone: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => must(await supabase.from('quick_messages').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ title: 'Could not delete', body: e.message, tone: 'danger' }),
  });
  const move = useMutation({
    mutationFn: async ({ a, b }: { a: QuickMessage; b: QuickMessage }) => {
      // swap places; equal positions get pulled apart first
      const pa = a.position === b.position ? b.position + (items.indexOf(a) < items.indexOf(b) ? 1 : -1) : b.position;
      must(await supabase.from('quick_messages').update({ position: pa }).eq('id', a.id).select());
      must(await supabase.from('quick_messages').update({ position: a.position }).eq('id', b.id).select());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-3">
      <p className="text-3 text-[12px] leading-relaxed">
        Your own messages, saved for every lead. Type <b>{'{first name}'}</b> and it becomes <b>{vars.first}</b> on this card. Only you can see these.
      </p>

      {list.isLoading ? <div className="grid place-items-center py-6"><Spinner /></div> : (
        <>
          <AnimatePresence initial={false}>
            {items.map((m, idx) => (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                <QuickCard msg={m} vars={vars}
                  onSave={(title, body) => save.mutateAsync({ id: m.id, title, body })}
                  onDelete={() => { if (window.confirm('Delete this quick message?')) remove.mutate(m.id); }}
                  onUp={idx > 0 ? () => move.mutate({ a: m, b: items[idx - 1] }) : undefined}
                  onDown={idx < items.length - 1 ? () => move.mutate({ a: m, b: items[idx + 1] }) : undefined} />
              </motion.div>
            ))}
          </AnimatePresence>

          {items.length === 0 && !adding && (
            <div className="fill rounded-[20px] px-4 py-5 text-center">
              <Zap className="mx-auto mb-2 size-5 text-iris" />
              <div className="text-[14px] font-bold">No quick messages yet</div>
              <p className="text-2 mx-auto mt-1 max-w-sm text-[13px]">Save the texts you send all the time, like your intro or a follow-up, and copy them in one tap.</p>
            </div>
          )}

          {adding ? (
            <Editor initial={{ title: '', body: 'Hi {first name}, it\'s {my name} from {company}. ' }}
              onCancel={() => setAdding(false)}
              onSave={async (title, body) => { await save.mutateAsync({ title, body }); setAdding(false); }} />
          ) : (
            <Button variant="glass" block icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>New quick message</Button>
          )}
        </>
      )}
    </div>
  );
}

function QuickCard({ msg, vars, onSave, onDelete, onUp, onDown }: {
  msg: QuickMessage;
  vars: Parameters<typeof fillQuick>[1];
  onSave: (title: string, body: string) => Promise<unknown>;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const text = fillQuick(msg.body, vars);

  if (editing) {
    return <Editor initial={{ title: msg.title, body: msg.body }} onCancel={() => setEditing(false)}
      onSave={async (t, b) => { await onSave(t, b); setEditing(false); }} />;
  }
  return (
    <div className="fill group rounded-[20px] p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{msg.title || 'Quick message'}</span>
        {msg.uses > 0 && <span className="text-3 tabular text-[11px] font-semibold">used {msg.uses}×</span>}
        <span className={clsx('tabular text-[11px] font-semibold', text.length > 320 ? 'text-warn' : 'text-3')}>{text.length} chars</span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>
      <div className="mt-2 flex items-center gap-1">
        <IconBtn label="Move up" onClick={onUp}><ArrowUp className="size-3.5" /></IconBtn>
        <IconBtn label="Move down" onClick={onDown}><ArrowDown className="size-3.5" /></IconBtn>
        <IconBtn label="Edit" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></IconBtn>
        <IconBtn label="Delete" onClick={onDelete} danger><Trash2 className="size-3.5" /></IconBtn>
        <motion.button type="button" whileTap={{ scale: 0.92 }}
          onClick={async () => {
            await copyText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
            toast({ title: 'Quick message copied', body: 'Paste it into Zoom Phone.', tone: 'success', duration: 1600 });
            void rpc('quick_message_used', { p_id: msg.id }).catch(() => undefined);
          }}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--btn)] px-3 text-[13px] font-bold text-[color:var(--btn-text)] hover:brightness-110">
          {copied ? <Check className="size-3.5" /> : <Zap className="size-3.5" />}{copied ? 'Copied' : 'Copy'}
        </motion.button>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick?: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={!onClick}
      className={clsx('grid size-8 place-items-center rounded-lg transition-colors disabled:opacity-25',
        danger ? 'text-bad hover:bg-bad/10' : 'text-[color:var(--text-2)] hover:bg-[var(--fill-2)]')}>
      {children}
    </button>
  );
}

function Editor({ initial, onSave, onCancel }: {
  initial: { title: string; body: string };
  onSave: (title: string, body: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (tag: string) => {
    const el = ref.current;
    if (!el) { setBody((b) => b + tag); return; }
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + tag + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };
  const ok = body.trim().length > 0 && body.length <= 2000;
  return (
    <div className="rounded-[20px] bg-iris/8 p-4 ring-1 ring-iris/30">
      <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Name it (optional), e.g. Intro after missed call"
        className="mb-2 w-full bg-transparent text-[13px] font-bold outline-none placeholder:text-[color:var(--text-3)]" />
      <textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)} rows={4} autoFocus
        className="field min-h-[110px] text-[14px] leading-relaxed" placeholder="Write your message…" />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-3 mr-1 text-[11px] font-bold">Insert</span>
        {PLACEHOLDERS.map((p) => (
          <button key={p.tag} type="button" title={`Becomes ${p.hint}`} onClick={() => insert(p.tag)}
            className="rounded-full bg-[var(--glass-strong)] px-2.5 py-1 text-[12px] font-semibold ring-1 ring-[var(--hairline)] hover:ring-iris/40">
            {p.tag}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className={clsx('tabular mr-auto text-[11px] font-semibold', body.length > 2000 ? 'text-bad' : 'text-3')}>{body.length}/2000</span>
        <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="iris" loading={busy} disabled={!ok} icon={<Check className="size-3.5" />}
          onClick={async () => { setBusy(true); try { await onSave(title.trim(), body.trim()); } finally { setBusy(false); } }}>
          Save
        </Button>
      </div>
    </div>
  );
}
