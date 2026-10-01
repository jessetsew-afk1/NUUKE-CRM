import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { CalendarDays, ChevronRight, Columns3, EyeOff, Megaphone, Plus } from 'lucide-react';
import {
  PLATFORMS, POST_STATUSES, platformMeta, postStatusMeta, teamOf, useFiles, usePosts, useProjectRefresh, type ProjectWithTeam,
} from '@/data/projects';
import { must, supabase } from '@/lib/supabase';
import type { ContentPost } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Empty, Input, Panel, Picker, Pill, Segmented, Sheet, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { friendly, toLocalInput } from '@/lib/format';
import { FileThumb } from './Files';
import { MonthCalendar } from './MonthCalendar';
import { usePeopleMap } from './bits';

const browserDay = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Content({ project, canEdit }: { project: ProjectWithTeam; canEdit: boolean }) {
  const posts = usePosts(project.id);
  const files = useFiles(project.id);
  const [view, setView] = useState<'calendar' | 'pipeline'>('calendar');
  const [open, setOpen] = useState<ContentPost | { new: true; day?: string } | null>(null);
  const refresh = useProjectRefresh();
  const toast = useToast();

  const advance = async (p: ContentPost) => {
    const i = POST_STATUSES.findIndex((s) => s.key === p.status);
    const next = POST_STATUSES[Math.min(POST_STATUSES.length - 1, i + 1)].key;
    const { error } = await supabase.from('content_posts').update({ status: next }).eq('id', p.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    if (next === 'posted') { celebrate('small'); toast({ title: `“${p.title}” is live 🎉`, tone: 'celebrate' }); }
    refresh(project.id);
  };

  const items = (posts.data ?? []).filter((p) => p.scheduled_at).map((p) => {
    const pm = platformMeta(p.platform);
    return {
      id: `p${p.id}`, date: browserDay(p.scheduled_at!), title: p.title, color: pm.color, kind: pm.label,
      time: new Date(p.scheduled_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      sub: postStatusMeta(p.status).label, faded: p.status === 'posted', icon: <Megaphone className="size-4" />, onClick: () => setOpen(p),
    };
  });
  const unscheduled = (posts.data ?? []).filter((p) => !p.scheduled_at);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'calendar', label: <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />Calendar</span> },
          { value: 'pipeline', label: <span className="flex items-center gap-1.5"><Columns3 className="size-4" />Pipeline</span> },
        ]} />
        <span className="flex-1" />
        {canEdit && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen({ new: true })}>Plan a post</Button>}
      </div>

      {!posts.isLoading && !posts.data?.length ? (
        <Panel><Empty art={<Megaphone className="size-10 text-iris" />} title="No content planned yet"
          body={canEdit ? 'Plan posts for every platform, attach the creative, and move them from idea to posted.' : 'When the team plans your social posts and launches, they will show up here.'}
          action={canEdit ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen({ new: true })}>Plan a post</Button> : undefined} /></Panel>
      ) : view === 'calendar' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel className="!p-5">
            <MonthCalendar items={items} legend={PLATFORMS.slice(0, 5).map((p) => ({ label: p.label, color: p.color }))}
              onAdd={canEdit ? (day) => setOpen({ new: true, day }) : undefined} addLabel="Plan a post" />
          </Panel>
          <Panel>
            <h3 className="mb-3 text-[15px] font-bold">Not scheduled yet</h3>
            <div className="space-y-2">
              {unscheduled.map((p) => <PostCard key={p.id} post={p} onOpen={() => setOpen(p)} />)}
              {!unscheduled.length && <p className="text-3 text-[13px]">Everything has a date. 👌</p>}
            </div>
          </Panel>
        </div>
      ) : (
        <div className="scroll-x -mx-4 flex gap-4 px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {POST_STATUSES.map((s) => {
            const list = (posts.data ?? []).filter((p) => p.status === s.key);
            return (
              <div key={s.key} className="glass flex min-h-[380px] w-[272px] shrink-0 flex-col rounded-[26px] p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  <h3 className="text-[14px] font-extrabold">{s.label}</h3>
                  <span className="fill tabular rounded-full px-2 text-[12px] font-bold">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <PostCard key={p.id} post={p} file={files.data?.find((f) => f.id === p.file_id)} onOpen={() => setOpen(p)}
                      onAdvance={canEdit && s.key !== 'posted' ? () => void advance(p) : undefined} nextLabel={POST_STATUSES[POST_STATUSES.findIndex((x) => x.key === s.key) + 1]?.label} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PostSheet post={open} project={project} canEdit={canEdit} onClose={() => setOpen(null)} />
    </div>
  );
}

function PostCard({ post, file, onOpen, onAdvance, nextLabel }: {
  post: ContentPost; file?: Parameters<typeof FileThumb>[0]['file']; onOpen: () => void; onAdvance?: () => void; nextLabel?: string;
}) {
  const pm = platformMeta(post.platform);
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass-strong overflow-hidden rounded-[18px]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        {file && <FileThumb file={file} className="h-28 w-full" />}
        <div className="p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: pm.color }}>{pm.label}</span>
            {!post.client_visible && <EyeOff className="text-3 size-3.5" />}
          </div>
          <div className="mt-1.5 text-[14px] font-bold leading-snug">{post.title}</div>
          <div className="text-3 mt-0.5 text-[12px]">{post.scheduled_at ? friendly(post.scheduled_at) : 'No date yet'}</div>
        </div>
      </button>
      {onAdvance && nextLabel && (
        <button type="button" onClick={onAdvance} className="hairline text-2 flex w-full items-center justify-center gap-1 border-t py-2 text-[12px] font-bold hover:bg-[var(--fill)] hover:text-[color:var(--text)]">
          Move to {nextLabel} <ChevronRight className="size-3.5" />
        </button>
      )}
    </motion.div>
  );
}

function PostSheet({ post, project, canEdit, onClose }: { post: ContentPost | { new: true; day?: string } | null; project: ProjectWithTeam; canEdit: boolean; onClose: () => void }) {
  const p = post && !('new' in post) ? post : null;
  const files = useFiles(project.id);
  const people = usePeopleMap();
  const [form, setForm] = useState({ title: '', platform: 'instagram', scheduled_at: '', status: 'idea', caption: '', file_id: '', owner_id: '', client_visible: true });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const k = p ? `p${p.id}` : post ? `new-${(post as { day?: string }).day ?? ''}` : null;
  if (k !== key) {
    setKey(k);
    const day = post && 'new' in post ? post.day : undefined;
    setForm(p ? {
      title: p.title, platform: p.platform, scheduled_at: p.scheduled_at ? toLocalInput(new Date(p.scheduled_at)) : '', status: p.status,
      caption: p.caption ?? '', file_id: p.file_id ? String(p.file_id) : '', owner_id: p.owner_id ?? '', client_visible: p.client_visible,
    } : { title: '', platform: 'instagram', scheduled_at: day ? `${day}T18:00` : '', status: day ? 'drafting' : 'idea', caption: '', file_id: '', owner_id: '', client_visible: true });
  }
  const set = <K extends keyof typeof form>(f: K, v: (typeof form)[K]) => setForm((x) => ({ ...x, [f]: v }));

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Give the post a name', tone: 'warning' }); return; }
    setBusy(true);
    try {
      const row = {
        title: form.title.trim(), platform: form.platform, scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        status: form.status, caption: form.caption.trim() || null, file_id: form.file_id ? Number(form.file_id) : null,
        owner_id: form.owner_id || null, client_visible: form.client_visible,
      };
      if (p) must(await supabase.from('content_posts').update(row).eq('id', p.id).select());
      else must(await supabase.from('content_posts').insert({ ...row, project_id: project.id }).select());
      if (row.status === 'posted' && p?.status !== 'posted') celebrate('small');
      toast({ title: p ? 'Post saved' : 'Post planned', tone: 'success' });
      refresh(project.id);
      onClose();
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!p) return;
    const { error } = await supabase.from('content_posts').delete().eq('id', p.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    refresh(project.id);
    onClose();
  };

  const attached = files.data?.find((f) => String(f.id) === form.file_id);

  if (p && !canEdit) {
    const pm = platformMeta(p.platform);
    const owner = p.owner_id ? people.get(p.owner_id) : null;
    return (
      <Sheet open onClose={onClose} title={p.title} width={520}>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-lg px-2 py-1 text-[12px] font-bold text-white" style={{ background: pm.color }}>{pm.label}</span>
          <Pill tone="neutral">{postStatusMeta(p.status).label}</Pill>
          {p.scheduled_at && <Pill tone="info">{friendly(p.scheduled_at)}</Pill>}
        </div>
        {attached && <FileThumb file={attached} className="mb-4 h-64 w-full rounded-2xl" />}
        {p.caption && <p className="whitespace-pre-wrap text-[14px]">{p.caption}</p>}
        {owner && <div className="text-2 mt-4 flex items-center gap-2 text-[13px]"><AgentAvatar who={owner} size={24} />{owner.full_name} is on it</div>}
      </Sheet>
    );
  }

  return (
    <Sheet open={!!post} onClose={onClose} width={620} title={p ? 'Post' : 'Plan a post'}
      footer={<>
        {p && <Button variant="ghost" className="mr-auto text-bad" onClick={remove}>Delete</Button>}
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{p ? 'Save' : 'Plan it'}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Post" autoFocus={!p} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Launch teaser reel" />
        <Picker label="Platform" value={form.platform} onChange={(v) => set('platform', v)} options={PLATFORMS.map((x) => ({ value: x.key, label: x.label, dot: x.color }))} />
        <Picker label="Stage" value={form.status} onChange={(v) => set('status', v)} options={POST_STATUSES.map((x) => ({ value: x.key, label: x.label, dot: x.color }))} />
        <Input label="Goes live" type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
        <Picker label="Who's on it" value={form.owner_id} onChange={(v) => set('owner_id', v)}
          options={[{ value: '', label: 'Nobody yet' }, ...teamOf(project).map((m) => ({ value: m.profile_id, label: m.profile!.full_name, icon: <AgentAvatar who={m.profile} size={20} /> }))]} />
        <Textarea className="sm:col-span-2" label="Caption" rows={4} value={form.caption} onChange={(e) => set('caption', e.target.value)} placeholder="Write the caption, hashtags, links…" />
        <Picker className="sm:col-span-2" label="Creative" value={form.file_id} onChange={(v) => set('file_id', v)}
          options={[{ value: '', label: 'None attached' }, ...(files.data ?? []).map((f) => ({ value: String(f.id), label: `${f.title} · v${f.version}` }))]} />
        {attached && <FileThumb file={attached} className={clsx('h-40 rounded-2xl sm:col-span-2')} />}
        <div className="sm:col-span-2"><Switch checked={form.client_visible} onChange={(v) => set('client_visible', v)} label="Show on the client's content calendar" /></div>
      </div>
    </Sheet>
  );
}
