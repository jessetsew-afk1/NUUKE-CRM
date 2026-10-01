import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  ArrowLeft, Check, CheckCircle2, Download, ExternalLink, Eye, EyeOff, Layers, MessageSquarePlus, PenLine, Send, Trash2, UploadCloud,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import {
  REVIEW_META, downloadUrl, embedUrl, fileKindLabel, isImage, isPdf, isVideo, sizeLabel, useFileComments, useFiles, useProject,
  useProjectRefresh, useSignedUrl,
} from '@/data/projects';
import { rpc, supabase } from '@/lib/supabase';
import type { FileComment, ProjectFile } from '@/lib/types';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Empty, Panel, Pill, Segmented, Skeleton, Spinner, Switch } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { celebrate } from '@/lib/celebrate';
import { ago, dateTime } from '@/lib/format';
import { ReviewDot, usePeopleMap } from './bits';
import { UploadSheet } from './Files';

export default function FileViewer() {
  const { id, fileId } = useParams();
  const projectId = Number(id);
  const { profile } = useAuth();
  const project = useProject(projectId);
  const files = useFiles(projectId);
  const navigate = useNavigate();
  const file = files.data?.find((f) => f.id === Number(fileId));
  const versions = useMemo(() => (files.data ?? []).filter((f) => file && (f.group_id ?? f.id) === (file.group_id ?? file.id)).sort((a, b) => a.version - b.version), [files.data, file]);
  const isClient = profile?.role === 'client';
  const canEdit = !isClient;
  const [pinMode, setPinMode] = useState(true);
  const [focus, setFocus] = useState<number | null>(null);
  const [newVersion, setNewVersion] = useState(false);

  if (files.isLoading || project.isLoading) return <Skeleton className="h-[70vh] rounded-[30px]" />;
  if (!file || !project.data) {
    return <Panel><Empty title="This file isn't available" body="It may have been removed, or it hasn't been shared with you." action={<Button onClick={() => navigate(-1)}>Go back</Button>} /></Panel>;
  }

  const latest = versions.at(-1);
  const isLatest = latest?.id === file.id;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="glass" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/projects/${projectId}/files`)}>Files</Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-extrabold leading-tight">{file.title}</h1>
          <div className="text-2 text-[13px]">{project.data.name} · {fileKindLabel(file.kind)} · v{file.version} · {ago(file.created_at)}{file.size_bytes ? ` · ${sizeLabel(file.size_bytes)}` : ''}</div>
        </div>
        {versions.length > 1 && (
          <Segmented size="sm" value={String(file.id)} onChange={(v) => navigate(`/projects/${projectId}/files/${v}`, { replace: true })}
            options={versions.map((v) => ({ value: String(v.id), label: `v${v.version}` }))} />
        )}
        <FileActions file={file} canEdit={canEdit} onNewVersion={() => setNewVersion(true)} />
      </div>

      {!isLatest && latest && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-warn/15 px-4 py-3 text-[13px] font-semibold text-warn">
          <Layers className="size-4" /> You're looking at an older version.
          <button type="button" className="underline" onClick={() => navigate(`/projects/${projectId}/files/${latest.id}`, { replace: true })}>See v{latest.version}</button>
        </div>
      )}

      <ReviewBar file={file} isClient={isClient} canEdit={canEdit} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel padded={false} className="overflow-hidden">
          <Preview file={file} pinMode={pinMode && isImage(file)} focus={focus} onFocus={setFocus} />
          {isImage(file) && (
            <div className="hairline flex items-center gap-3 border-t px-4 py-3 text-[13px]">
              <Switch checked={pinMode} onChange={setPinMode} label={<span className="font-semibold">Click the design to pin a comment</span>} />
            </div>
          )}
        </Panel>
        <CommentsPanel file={file} canEdit={canEdit} focus={focus} onFocus={setFocus} />
      </div>

      {file.description && (
        <Panel className="mt-5">
          <div className="text-3 mb-1 text-[12px] font-bold uppercase tracking-wider">Notes from the team</div>
          <p className="whitespace-pre-wrap text-[14px]">{file.description}</p>
        </Panel>
      )}

      <UploadSheet mode={newVersion ? (file.external_url ? 'link' : 'file') : null} project={project.data} canEdit={canEdit} isClient={isClient}
        newVersionOf={file} onClose={() => setNewVersion(false)} onDone={(nid) => navigate(`/projects/${projectId}/files/${nid}`, { replace: true })} />
    </div>
  );
}

/* ============================================================ review bar */
function ReviewBar({ file, isClient, canEdit }: { file: ProjectFile; isClient: boolean; canEdit: boolean }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useProjectRefresh();
  const qc = useQueryClient();
  const toast = useToast();
  const people = usePeopleMap();

  const decide = async (decision: 'approved' | 'changes_requested') => {
    setBusy(decision);
    try {
      await rpc('review_file', { p_file: file.id, p_decision: decision, p_note: note.trim() || undefined });
      if (decision === 'approved') { celebrate('big'); toast({ title: 'Approved — the team has been told 🎉', tone: 'celebrate' }); }
      else toast({ title: 'Sent — the team will get on it', tone: 'success' });
      setAsking(false);
      setNote('');
      refresh(file.project_id);
      void qc.invalidateQueries({ queryKey: ['file-comments', file.id] });
    } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); } finally { setBusy(null); }
  };

  const askReview = async () => {
    setBusy('ask');
    const { error } = await supabase.from('project_files').update({ review_status: 'pending' }).eq('id', file.id);
    setBusy(null);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    toast({ title: 'The client has been asked to review this', tone: 'success' });
    refresh(file.project_id);
  };

  if (file.review_status === 'pending' && isClient) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong mb-5 rounded-[26px] p-5" style={{ boxShadow: '0 0 0 2px rgba(255,69,58,.55), var(--shadow-lift)' }}>
        <div className="flex flex-wrap items-center gap-5">
          <ReviewDot size="lg" />
          <div className="min-w-[200px] flex-1">
            <div className="text-[19px] font-extrabold">Review now</div>
            <div className="text-2 text-[14px]">Look it over, drop comments anywhere, then approve it or tell the team what to change.</div>
          </div>
          {!asking && (
            <div className="flex flex-wrap gap-2">
              <Button size="lg" variant="glass" icon={<PenLine className="size-4" />} onClick={() => setAsking(true)}>Ask for changes</Button>
              <Button size="lg" variant="success" icon={<CheckCircle2 className="size-5" />} loading={busy === 'approved'} onClick={() => void decide('approved')}>Approve</Button>
            </div>
          )}
        </div>
        <AnimatePresence>
          {asking && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <textarea autoFocus className="field mt-4" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="What should change? Be as specific as you like — you can also pin comments on the design." />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
                <Button variant="primary" loading={busy === 'changes_requested'} disabled={!note.trim()} onClick={() => void decide('changes_requested')}>Send to the team</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  const meta = REVIEW_META[file.review_status];
  const by = file.reviewed_by ? people.get(file.reviewed_by) : null;
  if (file.review_status === 'approved' || file.review_status === 'changes_requested') {
    const ok = file.review_status === 'approved';
    return (
      <div className={clsx('mb-5 flex flex-wrap items-center gap-3 rounded-[22px] px-5 py-4', ok ? 'bg-ok/12' : 'bg-warn/12')}>
        {ok ? <CheckCircle2 className="size-6 text-ok" /> : <PenLine className="size-6 text-warn" />}
        <div className="min-w-0 flex-1">
          <div className={clsx('text-[15px] font-extrabold', ok ? 'text-ok' : 'text-warn')}>{meta.label}{by && ` by ${by.full_name}`}</div>
          <div className="text-2 text-[13px]">{file.reviewed_at && dateTime(file.reviewed_at)}{file.review_note && ` — “${file.review_note}”`}</div>
        </div>
        {canEdit && !ok && <span className="text-2 text-[13px]">Upload a new version when it's ready — the client will be asked again.</span>}
      </div>
    );
  }
  if (file.review_status === 'pending') {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-[22px] bg-bad/10 px-5 py-4">
        <ReviewDot size="sm" />
        <div className="text-[14px] font-semibold">Waiting for the client's review{file.review_requested_at && ` · asked ${ago(file.review_requested_at)}`}</div>
      </div>
    );
  }
  if (canEdit && !file.from_client) {
    return (
      <div className="fill mb-5 flex flex-wrap items-center gap-3 rounded-[22px] px-5 py-3.5">
        {file.client_visible ? <Eye className="size-5 text-ok" /> : <EyeOff className="text-3 size-5" />}
        <div className="min-w-0 flex-1 text-[14px] font-semibold">{file.client_visible ? 'Shared with the client' : 'Internal — the client cannot see this yet'}</div>
        <Button variant="primary" loading={busy === 'ask'} onClick={askReview}>Ask the client to review</Button>
      </div>
    );
  }
  return null;
}

function FileActions({ file, canEdit, onNewVersion }: { file: ProjectFile; canEdit: boolean; onNewVersion: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const refresh = useProjectRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const open = async () => {
    if (file.external_url) { window.open(file.external_url, '_blank', 'noopener'); return; }
    try { window.location.href = await downloadUrl(file.storage_path!, file.title); } catch (e) { toast({ title: (e as Error).message, tone: 'danger' }); }
  };
  const share = async (v: boolean) => {
    const { error } = await supabase.from('project_files').update({ client_visible: v }).eq('id', file.id);
    if (error) toast({ title: error.message, tone: 'danger' }); else refresh(file.project_id);
  };
  const remove = async () => {
    const { error } = await supabase.from('project_files').delete().eq('id', file.id);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    if (file.storage_path) await supabase.storage.from('project-files').remove([file.storage_path]);
    toast({ title: 'File deleted', tone: 'success' });
    refresh(file.project_id);
    navigate(`/projects/${file.project_id}/files`, { replace: true });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="glass" icon={file.external_url ? <ExternalLink className="size-4" /> : <Download className="size-4" />} onClick={open}>
        {file.external_url ? 'Open' : 'Download'}
      </Button>
      {canEdit && !file.from_client && <Button variant="glass" icon={<UploadCloud className="size-4" />} onClick={onNewVersion}>New version</Button>}
      {canEdit && !file.from_client && file.review_status !== 'pending' && (
        <Button variant="ghost" icon={file.client_visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={() => void share(!file.client_visible)}>
          {file.client_visible ? 'Hide from client' : 'Share'}
        </Button>
      )}
      {canEdit && (confirm
        ? <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>Really delete</Button>
        : <Button variant="ghost" className="text-bad" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)} aria-label="Delete" />)}
    </div>
  );
}

/* ================================================================ preview */
function Preview({ file, pinMode, focus, onFocus }: { file: ProjectFile; pinMode: boolean; focus: number | null; onFocus: (id: number | null) => void }) {
  const url = useSignedUrl(file.storage_path);
  if (file.external_url) {
    const embed = embedUrl(file.external_url);
    return embed ? (
      <iframe src={embed} title={file.title} className="block h-[72vh] w-full bg-black/5" allow="fullscreen; clipboard-write" allowFullScreen />
    ) : (
      <div className="grid h-[52vh] place-items-center p-8 text-center">
        <div>
          <ExternalLink className="mx-auto mb-3 size-10 text-iris" />
          <div className="text-[17px] font-extrabold">This one opens in its own tab</div>
          <p className="text-2 mx-auto mt-1 max-w-sm text-[14px]">{new URL(file.external_url).hostname} doesn't allow previews inside other apps.</p>
          <Button className="mt-5" variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => window.open(file.external_url!, '_blank', 'noopener')}>Open the link</Button>
        </div>
      </div>
    );
  }
  if (url.isLoading) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  if (!url.data) return <div className="text-3 grid h-[40vh] place-items-center text-sm">Preview unavailable.</div>;
  if (isImage(file)) return <PinBoard file={file} src={url.data} pinMode={pinMode} focus={focus} onFocus={onFocus} />;
  if (isPdf(file)) return <iframe src={url.data} title={file.title} className="block h-[78vh] w-full" />;
  if (isVideo(file)) return <video src={url.data} controls className="block max-h-[78vh] w-full bg-black" />;
  return (
    <div className="grid h-[44vh] place-items-center p-8 text-center">
      <div>
        <Download className="mx-auto mb-3 size-10 text-iris" />
        <div className="text-[17px] font-extrabold">No preview for this kind of file</div>
        <p className="text-2 mt-1 text-[14px]">Download it to take a look.</p>
      </div>
    </div>
  );
}

function PinBoard({ file, src, pinMode, focus, onFocus }: { file: ProjectFile; src: string; pinMode: boolean; focus: number | null; onFocus: (id: number | null) => void }) {
  const comments = useFileComments(file.id);
  const pins = useMemo(() => (comments.data ?? []).filter((c) => c.pin_x !== null && c.pin_y !== null), [comments.data]);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const { profile } = useAuth();

  const place = (e: React.MouseEvent) => {
    if (!pinMode || (e.target as HTMLElement).closest('[data-pin]')) return;
    const r = box.current!.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    setText('');
  };
  const save = async () => {
    if (!draft || !text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('file_comments').insert({ file_id: file.id, body: text.trim(), pin_x: draft.x, pin_y: draft.y, author_id: profile!.id });
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ['file-comments', file.id] });
  };

  return (
    <div className="scroll-y max-h-[78vh] bg-[var(--fill)]">
      <div ref={box} onClick={place} className={clsx('relative mx-auto w-full', pinMode && 'cursor-crosshair')}>
        <img src={src} alt={file.title} className="block w-full select-none" draggable={false} />
        {pins.map((c, i) => (
          <button
            key={c.id}
            data-pin
            type="button"
            onClick={() => onFocus(focus === c.id ? null : c.id)}
            className={clsx('absolute grid size-8 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-none text-[13px] font-extrabold text-white shadow-lg transition-transform',
              focus === c.id ? 'z-20 scale-125' : 'z-10 hover:scale-110', c.resolved_at && 'opacity-50')}
            style={{ left: `${c.pin_x! * 100}%`, top: `${c.pin_y! * 100}%`, background: c.resolved_at ? '#30C46C' : '#7C5CFF', boxShadow: '0 0 0 3px rgba(255,255,255,.85), 0 8px 18px rgba(0,0,0,.3)' }}
          >
            {i + 1}
          </button>
        ))}
        <AnimatePresence>
          {draft && (
            <motion.div
              data-pin
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 w-[260px]"
              style={{ left: `min(calc(${draft.x * 100}% - 12px), calc(100% - 268px))`, top: `${draft.y * 100}%` }}
            >
              <span className="absolute -top-8 grid size-8 place-items-center rounded-full rounded-bl-none bg-bad text-white shadow-lg"
                style={{ left: `clamp(0px, calc(${draft.x * 100}% ), 228px)` }}><MessageSquarePlus className="size-4" /></span>
              <div className="glass-strong mt-1 rounded-2xl p-2.5">
                <textarea autoFocus rows={3} className="field !min-h-0 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="What about this spot?"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); } if (e.key === 'Escape') setDraft(null); }} />
                <div className="mt-2 flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={save}>Pin it</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* =============================================================== comments */
function CommentsPanel({ file, canEdit, focus, onFocus }: { file: ProjectFile; canEdit: boolean; focus: number | null; onFocus: (id: number | null) => void }) {
  const comments = useFileComments(file.id);
  const people = usePeopleMap();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(true);

  const pinNo = useMemo(() => {
    const m = new Map<number, number>();
    (comments.data ?? []).filter((c) => c.pin_x !== null).forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [comments.data]);
  const list = (comments.data ?? []).filter((c) => showResolved || !c.resolved_at);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('file_comments').insert({ file_id: file.id, body: body.trim(), author_id: profile!.id });
    setBusy(false);
    if (error) { toast({ title: error.message, tone: 'danger' }); return; }
    setBody('');
    void qc.invalidateQueries({ queryKey: ['file-comments', file.id] });
  };
  const resolve = async (c: FileComment) => {
    const done = !c.resolved_at;
    const { error } = await supabase.from('file_comments').update({ resolved_at: done ? new Date().toISOString() : null, resolved_by: done ? profile!.id : null }).eq('id', c.id);
    if (error) toast({ title: error.message, tone: 'danger' });
    void qc.invalidateQueries({ queryKey: ['file-comments', file.id] });
  };

  const open = (comments.data ?? []).filter((c) => !c.resolved_at).length;

  return (
    <Panel className="flex max-h-[82vh] flex-col !p-0">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <h3 className="text-[15px] font-extrabold">Comments</h3>
          <p className="text-3 text-[12px]">{open} open · {(comments.data?.length ?? 0) - open} resolved</p>
        </div>
        <button type="button" onClick={() => setShowResolved((s) => !s)} className="text-2 text-[12px] font-bold hover:text-[color:var(--text)]">
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>
      <div className="scroll-y min-h-[160px] flex-1 space-y-2 px-3 pb-3">
        {list.length === 0 && <p className="text-3 px-3 py-10 text-center text-[13px]">No comments yet. {file.mime_type?.startsWith('image/') && 'Click on the design to pin one to a spot.'}</p>}
        {list.map((c) => {
          const who = people.get(c.author_id);
          const n = pinNo.get(c.id);
          return (
            <motion.div key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              onMouseEnter={() => n && onFocus(c.id)} onClick={() => n && onFocus(c.id)}
              className={clsx('rounded-[18px] p-3 transition-colors', focus === c.id ? 'bg-iris/12 ring-1 ring-iris/40' : 'fill', c.resolved_at && 'opacity-60')}>
              <div className="flex items-start gap-2.5">
                <AgentAvatar who={who ?? { id: c.author_id }} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    {n && <span className="grid size-5 place-items-center rounded-full bg-iris text-[11px] font-extrabold text-white">{n}</span>}
                    <b className="text-[13px]">{who?.full_name ?? 'Someone'}</b>
                    {who?.role === 'client' && <Pill tone="warn" className="!h-5 !text-[10px]">Client</Pill>}
                    <span className="text-3">{ago(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-snug">{c.body}</p>
                </div>
                {(canEdit || c.author_id === profile?.id) && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); void resolve(c); }} title={c.resolved_at ? 'Reopen' : 'Mark resolved'}
                    className={clsx('grid size-7 shrink-0 place-items-center rounded-full transition-colors', c.resolved_at ? 'bg-ok text-white' : 'text-3 hover:bg-[var(--fill-2)]')}>
                    <Check className="size-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="hairline flex items-end gap-2 border-t p-3">
        <textarea className="field min-h-[44px] flex-1 text-[13.5px]" rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button variant="primary" className="h-11" loading={busy} disabled={!body.trim()} onClick={send} icon={<Send className="size-4" />} aria-label="Send" />
      </div>
    </Panel>
  );
}
