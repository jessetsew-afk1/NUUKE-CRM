import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns';
import { MessagesSquare, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import { useMessages, type ProjectWithTeam } from '@/data/projects';
import { rpc, supabase } from '@/lib/supabase';
import type { ProjectMessage } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Panel, Pill } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { usePeopleMap } from './bits';

const dayLabel = (d: Date) => (isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE d MMMM'));

export function Messages({ project, isClient }: { project: ProjectWithTeam; isClient: boolean }) {
  const messages = useMessages(project.id);
  const people = usePeopleMap();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const list = useMemo(() => messages.data ?? [], [messages.data]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length]);
  useEffect(() => {
    if (!list.length) return;
    void rpc('mark_project_read', { p_project: project.id }).then(() => qc.invalidateQueries({ queryKey: ['project-unread'] }));
  }, [list.length, project.id, qc]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const optimistic = { id: -Date.now(), project_id: project.id, author_id: profile!.id, body: text, created_at: new Date().toISOString() } as ProjectMessage;
    qc.setQueryData<ProjectMessage[]>(['p', project.id, 'messages'], (xs) => [...(xs ?? []), optimistic]);
    setBody('');
    const { error } = await supabase.from('project_messages').insert({ project_id: project.id, body: text, author_id: profile!.id });
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); setBody(text); }
    void qc.invalidateQueries({ queryKey: ['p', project.id, 'messages'] });
  };

  return (
    <Panel strong padded={false} className="flex h-[calc(100dvh-300px)] min-h-[460px] flex-col overflow-hidden">
      <div className="hairline flex items-center gap-3 border-b px-5 py-3.5">
        <MessagesSquare className="size-5 text-iris" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">{isClient ? 'Talk to the team' : `Messages with ${project.client_name ?? 'the client'}`}</div>
          <div className="text-3 text-[12px]">{isClient ? 'Questions, feedback, files — the whole team sees it.' : 'The client and everyone on this project see this thread. Admins are notified of client messages.'}</div>
        </div>
      </div>
      <div className="scroll-y flex-1 space-y-1 px-4 py-4">
        {list.length === 0 && !messages.isLoading && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <MessagesSquare className="mx-auto mb-2 size-9 text-iris" />
              <div className="font-extrabold">No messages yet</div>
              <p className="text-3 text-[13px]">Say hello 👋</p>
            </div>
          </div>
        )}
        {list.map((m, i) => {
          const prev = list[i - 1];
          const d = parseISO(m.created_at);
          const newDay = !prev || !isSameDay(parseISO(prev.created_at), d);
          const grouped = !newDay && prev?.author_id === m.author_id && d.getTime() - Date.parse(prev.created_at) < 5 * 60_000;
          const mine = m.author_id === profile?.id;
          const who = people.get(m.author_id);
          return (
            <div key={m.id}>
              {newDay && <div className="text-3 my-4 text-center text-[11px] font-bold uppercase tracking-wider">{dayLabel(d)}</div>}
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                className={clsx('flex items-end gap-2', mine ? 'flex-row-reverse' : '', grouped ? 'mt-0.5' : 'mt-3')}>
                <div className="w-8 shrink-0">{!mine && !grouped && <AgentAvatar who={who ?? { id: m.author_id }} size={32} />}</div>
                <div className={clsx('max-w-[78%]', mine && 'items-end')}>
                  {!grouped && !mine && (
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-[12px]">
                      <b>{who?.full_name ?? 'Someone'}</b>
                      {who?.role === 'client' ? <Pill tone="warn" className="!h-5 !text-[10px]">Client</Pill> : who?.role === 'admin' ? <Pill tone="iris" className="!h-5 !text-[10px]">NUUKE</Pill> : null}
                    </div>
                  )}
                  <div className={clsx('whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[14px] leading-snug',
                    mine ? 'rounded-br-md bg-iris text-white' : 'fill-2 rounded-bl-md', m.id < 0 && 'opacity-60')}>
                    {m.body}
                  </div>
                  <div className={clsx('text-3 mt-0.5 px-1 text-[11px]', mine && 'text-right')}>{format(d, 'h:mm a')}</div>
                </div>
              </motion.div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="hairline flex items-end gap-2 border-t p-3">
        <textarea className="field min-h-[48px] flex-1" rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button variant="iris" className="h-12" loading={busy} disabled={!body.trim()} onClick={send} icon={<Send className="size-4" />}>Send</Button>
      </div>
    </Panel>
  );
}
