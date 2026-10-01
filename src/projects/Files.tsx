import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { EyeOff, FileText, Film, Frame, Image as ImageIcon, Link2, Paperclip, UploadCloud } from 'lucide-react';
import { useAuth } from '@/app/auth';
import {
  FILE_KINDS, REVIEW_META, fileKindLabel, isImage, isPdf, isVideo, latestVersions, sizeLabel, useFiles, useProjectRefresh,
  useSignedUrl, type ProjectWithTeam,
} from '@/data/projects';
import { must, supabase } from '@/lib/supabase';
import type { ProjectFile } from '@/lib/types';
import { Button, Chip, Empty, Input, Panel, Picker, Pill, Sheet, Skeleton, Switch, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago } from '@/lib/format';
import { ReviewDot } from './bits';

type Filter = 'all' | 'pending' | 'approved' | 'changes_requested' | 'client';

export function Files({ project, canEdit, isClient }: { project: ProjectWithTeam; canEdit: boolean; isClient: boolean }) {
  const files = useFiles(project.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [upload, setUpload] = useState<'file' | 'link' | null>(null);
  const navigate = useNavigate();

  const groups = useMemo(() => latestVersions(files.data ?? []), [files.data]);
  const n = (f: Filter) => groups.filter(({ latest }) => match(latest, f)).length;
  const shown = groups.filter(({ latest }) => match(latest, filter));
  const pending = n('pending');

  return (
    <div>
      {isClient && pending > 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => { const f = groups.find((g) => g.latest.review_status === 'pending'); if (f) navigate(`/projects/${project.id}/files/${f.latest.id}`); }}
          className="glass-strong mb-5 flex w-full items-center gap-5 rounded-[26px] p-5 text-left"
          style={{ boxShadow: '0 0 0 2px rgba(255,69,58,.55), var(--shadow-lift)' }}
        >
          <ReviewDot size="lg" count={pending} />
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-extrabold">{pending === 1 ? 'One thing is' : `${pending} things are`} waiting for your review</div>
            <div className="text-2 text-[14px]">The team can't move forward until you approve or ask for changes.</div>
          </div>
          <span className="rounded-2xl bg-bad px-5 py-3 text-[15px] font-extrabold text-white shadow-[0_8px_24px_-8px_rgba(255,69,58,.8)]">Review now</span>
        </motion.button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={groups.length}>All</Chip>
        <Chip active={filter === 'pending'} onClick={() => setFilter('pending')} count={pending} dot="#FF453A">Waiting for review</Chip>
        <Chip active={filter === 'changes_requested'} onClick={() => setFilter('changes_requested')} count={n('changes_requested')} dot="#FF9F0A">Changes requested</Chip>
        <Chip active={filter === 'approved'} onClick={() => setFilter('approved')} count={n('approved')} dot="#30C46C">Approved</Chip>
        <Chip active={filter === 'client'} onClick={() => setFilter('client')} count={n('client')}>{isClient ? 'Sent by you' : 'From the client'}</Chip>
        </div>
        <div className="flex gap-2">
        {canEdit && <Button variant="glass" icon={<Link2 className="size-4" />} onClick={() => setUpload('link')}>Add a link</Button>}
        <Button variant="primary" icon={<UploadCloud className="size-4" />} onClick={() => setUpload('file')}>{isClient ? 'Send a file' : 'Upload'}</Button>
        </div>
      </div>

      {files.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64 rounded-[26px]" />)}</div>
      ) : shown.length === 0 ? (
        <Panel><Empty art={<Paperclip className="size-10 text-iris" />} title={filter === 'all' ? 'No files yet' : 'Nothing here'}
          body={filter === 'all' ? (isClient ? 'Wireframes, designs and documents the team shares with you will appear here.' : 'Upload wireframes, designs, documents or prototype links, and share them with the client for review.') : undefined} /></Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ latest, versions }, i) => (
            <FileCard key={latest.id} file={latest} versions={versions.length} index={i} isClient={isClient}
              onOpen={() => navigate(`/projects/${project.id}/files/${latest.id}`)} />
          ))}
        </div>
      )}

      <UploadSheet mode={upload} project={project} canEdit={canEdit} isClient={isClient} onClose={() => setUpload(null)}
        onDone={(id) => navigate(`/projects/${project.id}/files/${id}`)} />
    </div>
  );
}

function match(f: ProjectFile, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'client') return f.from_client;
  return f.review_status === filter;
}

export function FileThumb({ file, className }: { file: ProjectFile; className?: string }) {
  const url = useSignedUrl(isImage(file) ? file.storage_path : null);
  const Icon = file.external_url ? (/figma\.com/i.test(file.external_url) ? Frame : Link2) : isVideo(file) ? Film : isPdf(file) ? FileText : isImage(file) ? ImageIcon : FileText;
  return (
    <div className={clsx('fill relative grid place-items-center overflow-hidden', className)}>
      {url.data ? (
        <img src={url.data} alt="" className="absolute inset-0 size-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <span className="glass grid size-14 place-items-center rounded-2xl"><Icon className="size-7 text-iris" /></span>
          <span className="text-3 text-[11px] font-bold uppercase tracking-wider">
            {file.external_url ? new URL(file.external_url).hostname.replace('www.', '') : file.mime_type?.split('/')[1]?.slice(0, 12) ?? 'file'}
          </span>
        </div>
      )}
    </div>
  );
}

function FileCard({ file, versions, index, isClient, onOpen }: { file: ProjectFile; versions: number; index: number; isClient: boolean; onOpen: () => void }) {
  const review = REVIEW_META[file.review_status];
  const pending = file.review_status === 'pending';
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.035 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="glass group relative overflow-hidden rounded-[26px] text-left"
      style={pending && isClient ? { boxShadow: '0 0 0 2px rgba(255,69,58,.6), var(--shadow)' } : undefined}
    >
      <FileThumb file={file} className="h-40 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
      {pending && <span className="absolute right-3 top-3"><ReviewDot size={isClient ? 'md' : 'sm'} /></span>}
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold">{file.title}</div>
            <div className="text-3 text-[12px]">{fileKindLabel(file.kind)} · v{file.version}{versions > 1 && ` of ${versions}`} · {ago(file.created_at)}</div>
          </div>
          {!file.client_visible && <EyeOff className="text-3 mt-1 size-4 shrink-0" aria-label="Not shared with the client" />}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {file.from_client ? <Pill tone="info">{isClient ? 'Sent by you' : 'From the client'}</Pill>
            : file.client_visible ? <Pill tone={review.tone}>{pending && isClient ? 'Needs your review' : review.label}</Pill>
              : <Pill tone="neutral">Internal</Pill>}
        </div>
      </div>
    </motion.button>
  );
}

/* ================================================================= upload */
const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80);

export async function uploadToProject(projectId: number, file: File) {
  const path = `${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from('project-files').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(/exceeded|too large|413/i.test(error.message) ? 'That file is too big — the limit is 50 MB' : error.message);
  return path;
}

const guessKind = (f: File) =>
  f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'design' : f.type === 'application/pdf' ? 'document' : 'document';

export function UploadSheet({
  mode, project, canEdit, isClient, onClose, onDone, newVersionOf,
}: {
  mode: 'file' | 'link' | null; project: ProjectWithTeam; canEdit: boolean; isClient: boolean; onClose: () => void;
  onDone?: (id: number) => void; newVersionOf?: ProjectFile;
}) {
  const { profile } = useAuth();
  const refresh = useProjectRefresh();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', kind: 'design', description: '', share: true, review: true });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const k = mode ? `${mode}-${newVersionOf?.id ?? ''}` : null;
  if (k !== key) {
    setKey(k);
    setFile(null);
    setForm({
      title: newVersionOf?.title ?? '', url: '', kind: newVersionOf?.kind ?? (mode === 'link' ? 'prototype' : 'design'),
      description: '', share: newVersionOf ? newVersionOf.client_visible : true, review: newVersionOf ? newVersionOf.client_visible : true,
    });
  }

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast({ title: 'That file is too big — the limit is 50 MB', tone: 'warning' }); return; }
    setFile(f);
    setForm((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, ''), kind: newVersionOf?.kind ?? guessKind(f) }));
  };

  const save = async () => {
    if (mode === 'file' && !file) { toast({ title: 'Choose a file first', tone: 'warning' }); return; }
    if (mode === 'link' && !/^https?:\/\/\S+\.\S+/.test(form.url.trim())) { toast({ title: 'Paste a full link, starting with https://', tone: 'warning' }); return; }
    if (!form.title.trim()) { toast({ title: 'Give it a name', tone: 'warning' }); return; }
    setBusy(true);
    try {
      const path = mode === 'file' ? await uploadToProject(project.id, file!) : null;
      const row = {
        project_id: project.id, title: form.title.trim(), kind: form.kind, description: form.description.trim() || null,
        storage_path: path, external_url: mode === 'link' ? form.url.trim() : null,
        mime_type: file?.type || null, size_bytes: file?.size ?? null, uploaded_by: profile!.id,
        group_id: newVersionOf ? newVersionOf.group_id ?? newVersionOf.id : null,
        ...(isClient
          ? { client_visible: true, from_client: true, review_status: 'none' }
          : { client_visible: form.share, review_status: form.share && form.review ? 'pending' : 'none' }),
      };
      const [saved] = must(await supabase.from('project_files').insert(row).select());
      toast({
        title: isClient ? 'Sent to the team' : row.review_status === 'pending' ? 'Shared — the client has been asked to review it' : 'Uploaded',
        tone: 'success',
      });
      refresh(project.id);
      onClose();
      onDone?.(saved.id);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!mode} onClose={onClose} width={600}
      title={newVersionOf ? `New version of ${newVersionOf.title}` : mode === 'link' ? 'Add a link' : isClient ? 'Send a file to the team' : 'Upload a file'}
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>
        {isClient ? 'Send' : form.share && form.review ? 'Upload & ask for review' : 'Upload'}</Button></>}>
      <div className="space-y-4">
        {mode === 'file' ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            onClick={() => input.current?.click()}
            className={clsx('grid cursor-pointer place-items-center rounded-[22px] border-2 border-dashed p-8 text-center transition-colors',
              over ? 'border-iris bg-iris/10' : 'border-[var(--hairline)] hover:bg-[var(--fill)]')}
          >
            <input ref={input} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <UploadCloud className="mb-2 size-9 text-iris" />
            {file ? (
              <>
                <div className="text-[15px] font-bold">{file.name}</div>
                <div className="text-3 text-[13px]">{sizeLabel(file.size)} · tap to choose another</div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold">Drop a file here, or tap to choose</div>
                <div className="text-3 text-[13px]">Images, PDFs, videos, documents — up to 50 MB</div>
              </>
            )}
          </div>
        ) : (
          <Input label="Link" placeholder="https://www.figma.com/proto/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            hint="Figma, Google Docs, YouTube and Loom play right inside NUUKE" leading={<Link2 className="size-4" />} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!!newVersionOf} />
          <Picker label="What is it?" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={FILE_KINDS.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <Textarea label={newVersionOf ? 'What changed?' : 'Notes'} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={newVersionOf ? 'e.g. Bigger CTA, new hero image' : 'Anything the reviewer should know'} />
        {canEdit && !isClient && (
          <div className="fill space-y-3 rounded-[20px] p-4">
            <Switch checked={form.share} onChange={(v) => setForm({ ...form, share: v, review: v && form.review })} label="Share with the client" />
            {form.share && <Switch checked={form.review} onChange={(v) => setForm({ ...form, review: v })} label={<span>Ask them to review it <span className="text-3">(they get a red “Review now” alert)</span></span>} />}
          </div>
        )}
      </div>
    </Sheet>
  );
}
