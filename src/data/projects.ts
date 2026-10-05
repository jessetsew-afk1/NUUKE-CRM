import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { liveChannel, must, rpc, supabase } from '@/lib/supabase';
import type {
  ContentPost, FileComment, Profile, Project, ProjectActivity, ProjectEvent, ProjectFile, ProjectMessage, Sprint, Task,
  TaskComment, TaskPriority, TaskStatus,
} from '@/lib/types';

/* ================================================================ vocabulary */
export const TASK_STATUSES: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: '#8E8AA0' },
  { key: 'todo', label: 'To do', color: '#5AB8FF' },
  { key: 'in_progress', label: 'In progress', color: '#FF9F0A' },
  { key: 'review', label: 'In review', color: '#7C5CFF' },
  { key: 'done', label: 'Done', color: '#30C46C' },
];
export const statusMeta = (s: string) => TASK_STATUSES.find((x) => x.key === s) ?? TASK_STATUSES[1];

export const PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: 'urgent', label: 'Urgent', color: '#FF453A' },
  { key: 'high', label: 'High', color: '#FF9A6B' },
  { key: 'medium', label: 'Medium', color: '#5AB8FF' },
  { key: 'low', label: 'Low', color: '#8E8AA0' },
];
export const priorityMeta = (p: string) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[2];

export const PROJECT_STATUSES = [
  { key: 'planning', label: 'Planning', tone: 'info' },
  { key: 'active', label: 'In progress', tone: 'good' },
  { key: 'on_hold', label: 'On hold', tone: 'warn' },
  { key: 'done', label: 'Delivered', tone: 'great' },
] as const;
export const projectStatusMeta = (s: string) => PROJECT_STATUSES.find((x) => x.key === s) ?? PROJECT_STATUSES[1];

export const PROJECT_COLORS = ['#7C5CFF', '#5AB8FF', '#34D3A0', '#FF9A6B', '#FF6B9A', '#FFC23A', '#0B0B10'];

export const FILE_KINDS = [
  { key: 'wireframe', label: 'Wireframe' },
  { key: 'design', label: 'Design' },
  { key: 'prototype', label: 'Prototype' },
  { key: 'document', label: 'Document' },
  { key: 'video', label: 'Video' },
  { key: 'other', label: 'Other' },
] as const;
export const fileKindLabel = (k: string) => FILE_KINDS.find((x) => x.key === k)?.label ?? 'File';

export const REVIEW_META: Record<string, { label: string; tone: 'neutral' | 'bad' | 'good' | 'warn' }> = {
  none: { label: 'Shared', tone: 'neutral' },
  pending: { label: 'Waiting for review', tone: 'bad' },
  approved: { label: 'Approved', tone: 'good' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
};

export const PLATFORMS: { key: string; label: string; color: string }[] = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'tiktok', label: 'TikTok', color: '#25F4EE' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000' },
  { key: 'x', label: 'X', color: '#8E8AA0' },
  { key: 'website', label: 'Website / blog', color: '#34D3A0' },
  { key: 'email', label: 'Email', color: '#FFC23A' },
  { key: 'other', label: 'Other', color: '#7C5CFF' },
];
export const platformMeta = (p: string) => PLATFORMS.find((x) => x.key === p) ?? PLATFORMS[PLATFORMS.length - 1];

export const POST_STATUSES = [
  { key: 'idea', label: 'Idea', color: '#8E8AA0' },
  { key: 'drafting', label: 'Drafting', color: '#5AB8FF' },
  { key: 'ready', label: 'Ready', color: '#7C5CFF' },
  { key: 'scheduled', label: 'Scheduled', color: '#FF9F0A' },
  { key: 'posted', label: 'Posted', color: '#30C46C' },
] as const;
export const postStatusMeta = (s: string) => POST_STATUSES.find((x) => x.key === s) ?? POST_STATUSES[0];

export const EVENT_KINDS = [
  { key: 'meeting', label: 'Meeting', color: '#5AB8FF' },
  { key: 'milestone', label: 'Milestone', color: '#7C5CFF' },
  { key: 'deadline', label: 'Deadline', color: '#FF453A' },
  { key: 'launch', label: 'Launch', color: '#30C46C' },
  { key: 'other', label: 'Other', color: '#8E8AA0' },
] as const;
export const eventKindMeta = (k: string) => EVENT_KINDS.find((x) => x.key === k) ?? EVENT_KINDS[4];

/* ================================================================== projects */
export type MiniProfile = Pick<Profile, 'id' | 'full_name' | 'avatar' | 'role' | 'department' | 'title' | 'email'>;
export interface Member { profile_id: string; is_lead: boolean; added_at: string; profile: MiniProfile | null }
export type ProjectWithTeam = Project & { members: Member[] };

export const teamOf = (p: ProjectWithTeam | undefined) =>
  (p?.members ?? []).filter((m) => m.profile && m.profile.role !== 'client');
export const clientsOf = (p: ProjectWithTeam | undefined) =>
  (p?.members ?? []).filter((m) => m.profile?.role === 'client');

/** Every project the person can see (RLS decides), with its people. */
export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ['projects'],
    enabled,
    queryFn: async () => {
      const rows = must(await supabase
        .from('projects')
        .select('*, project_members(profile_id, is_lead, added_at, profiles(id, full_name, avatar, role, department, title, email))')
        .order('created_at', { ascending: false }));
      return rows.map(({ project_members, ...p }) => ({
        ...p,
        members: (project_members ?? []).map((m) => ({
          profile_id: m.profile_id, is_lead: m.is_lead, added_at: m.added_at, profile: (m.profiles ?? null) as MiniProfile | null,
        })),
      })) as ProjectWithTeam[];
    },
  });
}

export function useProject(id: number | null | undefined) {
  const q = useProjects();
  return { ...q, data: q.data?.find((p) => p.id === id) };
}

/** The project to open: the one remembered on this device, else one waiting on a review, else the newest. */
export function defaultProject<P extends { id: number; archived_at: string | null }>(
  projects: P[] | undefined, pending: { project_id: number }[] | undefined, remembered: number | null,
) {
  const live = (projects ?? []).filter((p) => !p.archived_at);
  return live.find((p) => p.id === remembered)
    ?? live.find((p) => pending?.some((f) => f.project_id === p.id))
    ?? live[0];
}

/** The client's chosen project, remembered on this device. */
const CURRENT_KEY = 'nuuke-current-project';
export function readCurrentProject() {
  try { return Number(localStorage.getItem(CURRENT_KEY)) || null; } catch { return null; }
}
export function useCurrentProject() {
  const [id, setId] = useState<number | null>(readCurrentProject);
  useEffect(() => {
    const on = () => setId(readCurrentProject());
    window.addEventListener('nuuke-project', on);
    return () => window.removeEventListener('nuuke-project', on);
  }, []);
  const set = useCallback((v: number) => {
    try { localStorage.setItem(CURRENT_KEY, String(v)); } catch { /* private mode */ }
    window.dispatchEvent(new Event('nuuke-project'));
  }, []);
  return [id, set] as const;
}

/* ===================================================================== tasks */
export function useTasks(projectId: number | undefined) {
  return useQuery({
    queryKey: ['p', projectId, 'tasks'],
    enabled: !!projectId,
    queryFn: async () => must(await supabase.from('tasks').select('*').eq('project_id', projectId!).order('position')) as Task[],
  });
}

/** A light index of every visible task, for cards, the workspace and progress. */
export type TaskLite = Pick<Task, 'id' | 'project_id' | 'title' | 'status' | 'priority' | 'assignee_id' | 'due_on' | 'completed_at' | 'sprint_id' | 'client_visible' | 'created_at'>;
export function useTaskIndex() {
  return useQuery({
    queryKey: ['task-index'],
    queryFn: async () => must(await supabase
      .from('tasks')
      .select('id, project_id, title, status, priority, assignee_id, due_on, completed_at, sprint_id, client_visible, created_at')
      .limit(5000)) as TaskLite[],
  });
}

export function progressOf(tasks: { status: string }[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total, done, ratio: total ? done / total : 0 };
}

export function useTaskComments(taskId: number | null | undefined) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    enabled: !!taskId,
    queryFn: async () => must(await supabase.from('task_comments').select('*').eq('task_id', taskId!).order('created_at')) as TaskComment[],
  });
}

/* =================================================================== sprints */
export function useSprints(projectId: number | undefined) {
  return useQuery({
    queryKey: ['p', projectId, 'sprints'],
    enabled: !!projectId,
    queryFn: async () => must(await supabase.from('sprints').select('*').eq('project_id', projectId!).order('starts_on')) as Sprint[],
  });
}

/* ===================================================================== files */
export function useFiles(projectId: number | undefined) {
  return useQuery({
    queryKey: ['p', projectId, 'files'],
    enabled: !!projectId,
    queryFn: async () => must(await supabase.from('project_files').select('*').eq('project_id', projectId!).order('created_at', { ascending: false })) as ProjectFile[],
  });
}

/** One card per deliverable: its newest version, plus how many versions exist. */
export function latestVersions(files: ProjectFile[]) {
  const groups = new Map<number, ProjectFile[]>();
  for (const f of files) {
    const g = f.group_id ?? f.id;
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  return [...groups.values()]
    .map((vs) => { vs.sort((a, b) => b.version - a.version); return { latest: vs[0], versions: vs }; })
    .sort((a, b) => Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at));
}

export function useFileComments(fileId: number | null | undefined) {
  return useQuery({
    queryKey: ['file-comments', fileId],
    enabled: !!fileId,
    refetchInterval: 20_000,
    queryFn: async () => must(await supabase.from('file_comments').select('*').eq('file_id', fileId!).order('created_at')) as FileComment[],
  });
}

/** Everything waiting on a client's decision that this person can see. */
export function usePendingReviews(enabled = true) {
  return useQuery({
    queryKey: ['pending-reviews'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => must(await supabase
      .from('project_files')
      .select('id, project_id, title, version, kind, review_requested_at')
      .eq('review_status', 'pending')
      .order('review_requested_at')) as Pick<ProjectFile, 'id' | 'project_id' | 'title' | 'version' | 'kind' | 'review_requested_at'>[],
  });
}

const signed = new Map<string, { url: string; until: number }>();
/** A short-lived link to a private file. */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed', path],
    enabled: !!path,
    staleTime: 40 * 60_000,
    queryFn: async () => {
      const hit = signed.get(path!);
      if (hit && hit.until > Date.now()) return hit.url;
      const { data, error } = await supabase.storage.from('project-files').createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      signed.set(path!, { url: data.signedUrl, until: Date.now() + 45 * 60_000 });
      return data.signedUrl;
    },
  });
}

export async function downloadUrl(path: string, name: string) {
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(path, 600, { download: name });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const isImage = (f: Pick<ProjectFile, 'mime_type'>) => !!f.mime_type?.startsWith('image/');
export const isPdf = (f: Pick<ProjectFile, 'mime_type'>) => f.mime_type === 'application/pdf';
export const isVideo = (f: Pick<ProjectFile, 'mime_type'>) => !!f.mime_type?.startsWith('video/');

export function sizeLabel(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${v} B`;
}

/** Figma links play inside the page; most other sites refuse to be framed. */
export function embedUrl(url: string) {
  if (/figma\.com\//i.test(url)) return `https://www.figma.com/embed?embed_host=nuuke&url=${encodeURIComponent(url)}`;
  if (/docs\.google\.com\//i.test(url)) return url.replace(/\/(edit|view)(\?.*)?$/, '/preview');
  if (/youtube\.com\/watch\?v=|youtu\.be\//i.test(url)) {
    const id = url.match(/(?:v=|youtu\.be\/)([\w-]{6,})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (/loom\.com\/share\//i.test(url)) return url.replace('/share/', '/embed/');
  return null;
}

/* ================================================================= calendars */
export function usePosts(projectId?: number) {
  return useQuery({
    queryKey: ['p', projectId ?? 'all', 'posts'],
    queryFn: async () => {
      let q = supabase.from('content_posts').select('*').order('scheduled_at', { ascending: true, nullsFirst: false });
      if (projectId) q = q.eq('project_id', projectId);
      return must(await q) as ContentPost[];
    },
  });
}

export function useEvents(projectId?: number) {
  return useQuery({
    queryKey: ['p', projectId ?? 'all', 'events'],
    queryFn: async () => {
      let q = supabase.from('project_events').select('*').order('starts_at');
      if (projectId) q = q.eq('project_id', projectId);
      return must(await q) as ProjectEvent[];
    },
  });
}

export function useAllSprints() {
  return useQuery({
    queryKey: ['p', 'all', 'sprints'],
    queryFn: async () => must(await supabase.from('sprints').select('*').order('starts_on')) as Sprint[],
  });
}

/* ============================================================ talk & activity */
export function useMessages(projectId: number | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    const channel = liveChannel(`project-messages:${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ['p', projectId, 'messages'] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, qc]);
  return useQuery({
    queryKey: ['p', projectId, 'messages'],
    enabled: !!projectId,
    refetchInterval: 10_000,
    queryFn: async () => must(await supabase.from('project_messages').select('*').eq('project_id', projectId!)
      .order('created_at', { ascending: false }).limit(300)).reverse() as ProjectMessage[],
  });
}

export function useUnread(enabled = true) {
  return useQuery({
    queryKey: ['project-unread'],
    enabled,
    refetchInterval: 20_000,
    queryFn: () => rpc<{ project_id: number; unread: number; last_at: string }[]>('project_unread'),
  });
}

export function useActivity(projectId: number | undefined, limit = 40) {
  return useQuery({
    queryKey: ['p', projectId, 'activity', limit],
    enabled: !!projectId,
    refetchInterval: 30_000,
    queryFn: async () => must(await supabase.from('project_activity').select('*').eq('project_id', projectId!)
      .order('created_at', { ascending: false }).limit(limit)) as ProjectActivity[],
  });
}

/** Recent client messages across every project — the admin's inbox. */
export function useClientInbox(enabled: boolean) {
  return useQuery({
    queryKey: ['client-inbox'],
    enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      const rows = must(await supabase
        .from('project_messages')
        .select('*, profiles!inner(id, full_name, avatar, role)')
        .eq('profiles.role', 'client')
        .order('created_at', { ascending: false })
        .limit(12));
      return rows as (ProjectMessage & { profiles: MiniProfile })[];
    },
  });
}

/* ================================================================= refreshing */
/** After a change in a project: refresh its data and everything that summarises it. */
export function useProjectRefresh() {
  const qc = useQueryClient();
  return useCallback((projectId?: number) => {
    if (projectId) void qc.invalidateQueries({ queryKey: ['p', projectId] });
    void qc.invalidateQueries({ queryKey: ['p', 'all'] });
    void qc.invalidateQueries({ queryKey: ['task-index'] });
    void qc.invalidateQueries({ queryKey: ['pending-reviews'] });
  }, [qc]);
}
