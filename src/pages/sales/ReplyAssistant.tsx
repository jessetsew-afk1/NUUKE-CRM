/**
 * The reply assistant on a text card. The setter pastes what the prospect texted back,
 * gets a suggested reply (written by netlify/functions/reply-assist from the admin's
 * playbook and the whole conversation), edits it if they like, sends it from Zoom, and
 * ticks Sent so the next suggestion knows what was said.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, Check, Copy, RefreshCw, Send, Sparkles } from 'lucide-react';
import {
  INTENT, addToThread, prettyPhone, savePlaybook, suggestReply, useMarkText, usePlaybook, useThread, zoomSmsHref,
  type KitText, type ReplySuggestion,
} from '@/data/textKit';
import { copyText } from '@/lib/clipboard';
import { useZoomLink } from '@/lib/zoomLaunch';
import { dayShort } from '@/lib/format';
import { Button, Input, Panel, Pill, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';

export function ReplyAssistant({ r, sender, onClose }: { r: KitText; sender: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const mark = useMarkText();
  const zoomLink = useZoomLink();
  const thread = useThread(r.id);
  const [theirs, setTheirs] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState<null | 'ask' | 'sent' | 'out'>(null);
  const [draft, setDraft] = useState<ReplySuggestion | null>(null);
  const [text, setText] = useState('');
  const [opened, setOpened] = useState(false);

  // What was said, oldest first. Suggestions that were never sent stay out of it.
  const said = (thread.data ?? []).filter((m) => m.kind !== 'ai');
  const last = said[said.length - 1];
  const waitingOnUs = last?.kind === 'them';
  const firstName = sender.trim().split(/\s+/)[0] || 'You';

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['text-thread', r.id] }),
    qc.invalidateQueries({ queryKey: ['text-kit'] }),
  ]);

  const ask = async (withMessage: boolean) => {
    setBusy('ask');
    try {
      const s = await suggestReply(r.id, withMessage ? theirs.trim() : undefined, hint.trim() || undefined);
      setDraft(s);
      setText(s.reply);
      setOpened(false);
      if (withMessage) setTheirs('');
      setHint('');
      if (s.opted_out) toast({ title: 'They asked to stop', body: 'Opted out. Don\'t reply and never text them again.', tone: 'info' });
      await refresh();
    } catch (e) {
      toast({ title: 'No suggestion', body: (e as Error).message, tone: 'danger' });
      // Their message may already be saved even if the suggestion failed.
      if (withMessage) await refresh();
    } finally {
      setBusy(null);
    }
  };

  const sent = async () => {
    setBusy('sent');
    try {
      await addToThread(r.id, 'us', text.trim());
      setDraft(null);
      setText('');
      toast({ title: 'Saved to the conversation', tone: 'success', duration: 1600 });
      await refresh();
    } catch (e) {
      toast({ title: 'Not saved', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const optOut = async () => {
    setBusy('out');
    try {
      await mark(r.id, 'opted_out');
      toast({ title: 'Opted out. Never text them again.', tone: 'success' });
      onClose();
    } catch (e) {
      toast({ title: 'Not saved', body: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    await copyText(text);
    toast({ title: 'Reply copied', tone: 'success', duration: 1600 });
  };

  return (
    <div className="mt-3 rounded-2xl border border-[var(--hairline)] p-3.5">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
        <Sparkles className="size-4 text-iris" /> Reply assistant
      </div>

      {said.length > 0 && (
        <div className="mb-3 grid gap-1.5">
          {said.map((m) => (
            <div key={m.id} className={clsx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px]',
              m.kind === 'them' ? 'fill justify-self-start' : 'justify-self-end bg-[#0B5CFF] text-white')}>
              {m.body}
              <div className={clsx('mt-0.5 text-[10.5px]', m.kind === 'them' ? 'text-3' : 'text-white/70')}>
                {m.kind === 'them' ? r.name.split(/\s+/)[0] : 'Us'} · {dayShort(m.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!draft && (
        <>
          <Textarea
            label={waitingOnUs ? 'Did they text again? Paste it here (optional)' : 'What did they text back?'}
            rows={3}
            value={theirs}
            onChange={(e) => setTheirs(e.target.value)}
            placeholder="Paste their message from Zoom"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={busy === 'ask'} disabled={!theirs.trim() && !waitingOnUs}
              icon={<Sparkles className="size-4" />} onClick={() => ask(!!theirs.trim())}>
              {theirs.trim() ? 'Get a reply' : 'Suggest a reply'}
            </Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
          {busy === 'ask' && <p className="text-3 mt-2 text-[12px]">Reading the whole conversation… usually a few seconds.</p>}
        </>
      )}

      {draft && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone={INTENT[draft.intent].tone} solid>{INTENT[draft.intent].label}</Pill>
            {draft.next_step && <span className="text-2 text-[12.5px]">{draft.next_step}</span>}
          </div>
          {draft.intent === 'stop' ? (
            <p className="text-2 text-[13px]">They asked us to stop, so there's no reply to send. They're marked opted out.</p>
          ) : (
            <>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} hint={`${text.length} characters. Edit it if you like. It's sent as ${firstName}.`} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={zoomSmsHref(r.phone)}
                  onClick={() => { void copy(); setOpened(true); zoomLink('text', prettyPhone(r.phone)); }}
                  className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#0B5CFF] px-4 text-sm font-semibold text-white transition hover:brightness-110">
                  <Send className="size-4" /> Send in Zoom
                </a>
                <Button size="md" icon={<Copy className="size-4" />} onClick={copy}>Copy</Button>
                <Button variant={opened ? 'success' : 'ghost'} loading={busy === 'sent'} disabled={!text.trim()} icon={<Check className="size-4" />} onClick={sent}>
                  {opened ? 'Sent it? Tick Sent' : 'Sent'}
                </Button>
                {draft.intent === 'not_interested' && (
                  <Button variant="ghost" loading={busy === 'out'} icon={<Ban className="size-4" />} onClick={optOut}>Opt them out</Button>
                )}
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input className="min-w-[12rem] flex-1" value={hint} onChange={(e) => setHint(e.target.value)}
              placeholder='Not quite? e.g. "shorter", "offer Thursday 2pm", "in Spanish"' />
            <Button size="md" loading={busy === 'ask'} icon={<RefreshCw className="size-4" />} onClick={() => ask(false)}>Try again</Button>
            <Button variant="ghost" onClick={() => { setDraft(null); onClose(); }}>Close</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Admin: the instructions every suggestion follows (offers, tone, what never to say). */
export function Playbook() {
  const toast = useToast();
  const qc = useQueryClient();
  const book = usePlaybook();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = body ?? book.data?.body ?? '';

  const save = async () => {
    setSaving(true);
    try {
      await savePlaybook(value);
      setBody(null);
      await qc.invalidateQueries({ queryKey: ['ai-playbook'] });
      toast({ title: 'Playbook saved', body: 'The next suggestion follows it.', tone: 'success' });
    } catch (e) {
      toast({ title: 'Not saved', body: (e as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="mb-4">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[rgba(124,92,255,0.14)] text-iris"><Sparkles className="size-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Reply assistant playbook</span>
          <span className="text-2 block text-[12.5px]">
            What the assistant knows about NUUKE and how it replies. {book.data?.updated_at ? `Last changed ${dayShort(book.data.updated_at)}.` : ''}
          </span>
        </span>
        <span className="text-3 text-[12px] font-semibold">{open ? 'Hide' : 'Edit'}</span>
      </button>
      {open && (
        <div className="mt-3">
          <Textarea rows={16} value={value} onChange={(e) => setBody(e.target.value)}
            hint="Plain instructions, as you'd brief a new setter: your offers, your tone, what never to say, how to handle price questions." />
          <div className="mt-2 flex gap-2">
            <Button variant="primary" loading={saving} disabled={body === null || !value.trim()} onClick={save}>Save playbook</Button>
            {body !== null && <Button variant="ghost" onClick={() => setBody(null)}>Discard changes</Button>}
          </div>
        </div>
      )}
    </Panel>
  );
}
