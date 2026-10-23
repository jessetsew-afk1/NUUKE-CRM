/**
 * Tasks as a file: Markdown laid out for pasting into an AI assistant (grouped by
 * project, then overdue / this week / later / done, with every detail spelled out),
 * or CSV for a spreadsheet.
 */
export interface ExportTask {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  deliverable: string | null;
  owner_label: string | null;
  side: string | null;
  status: string;
  priority: string;
  due_on: string | null;
  labels: string[] | null;
  phase: string | null;
  assignee: string | null;
  project: { name: string; client_name: string | null };
}

export interface ExportContext {
  /** Whose tasks these are, for the heading ("Isaiah Remi", or "the whole team"). */
  title: string;
  /** What the list was filtered to, in words. */
  scope: string;
  today: string;
  origin: string;
}

const STATUS: Record<string, string> = { backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' };
const SIDE: Record<string, string> = { team: 'Our team', client: 'The client', both: 'Both sides' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const link = (t: ExportTask, origin: string) => `${origin}/projects/${t.project_id}/calendar?task=${t.id}`;

function when(t: ExportTask, today: string) {
  if (t.status === 'done') return 'done';
  if (!t.due_on) return 'undated';
  const d = daysBetween(today, t.due_on);
  return d < 0 ? 'overdue' : d <= 7 ? 'week' : 'later';
}

function dueText(t: ExportTask, today: string) {
  if (!t.due_on) return 'No date';
  const d = daysBetween(today, t.due_on);
  const rel = t.status === 'done' ? '' : d < 0 ? ` (${-d} day${d === -1 ? '' : 's'} overdue)` : d === 0 ? ' (today)' : d === 1 ? ' (tomorrow)' : ` (in ${d} days)`;
  return longDay(t.due_on) + rel;
}

const byDue = (a: ExportTask, b: ExportTask) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.id - b.id;

export function tasksMarkdown(tasks: ExportTask[], ctx: ExportContext) {
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => when(t, ctx.today) === 'overdue').length;
  const out: string[] = [
    `# Tasks: ${ctx.title}`,
    '',
    `Exported ${longDay(ctx.today)} from the NUUKE CRM (${ctx.scope}). ${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${open.length} open${overdue ? ` (${overdue} overdue)` : ''}, ${tasks.length - open.length} done.`,
    '"Who does it" is the person or role the plan names; "Side" says whether it is ours, the client\'s, or shared. Dates are due dates.',
  ];
  const projects = [...new Map(tasks.map((t) => [t.project_id, t.project])).entries()];
  const sections: [string, string][] = [['overdue', 'Overdue'], ['week', 'Due in the next 7 days'], ['later', 'Later'], ['undated', 'No due date'], ['done', 'Done']];
  for (const [pid, p] of projects) {
    const mine = tasks.filter((t) => t.project_id === pid);
    out.push('', `## ${p.name}${p.client_name ? ` (client: ${p.client_name})` : ''}`);
    for (const [key, heading] of sections) {
      const list = mine.filter((t) => when(t, ctx.today) === key).sort(byDue);
      if (!list.length) continue;
      out.push('', `### ${heading} (${list.length})`);
      for (const t of list) {
        out.push('', `#### ${t.title}`);
        out.push(`- Due: ${dueText(t, ctx.today)}`);
        out.push(`- Status: ${STATUS[t.status] ?? t.status} · Priority: ${cap(t.priority)}`);
        if (t.phase) out.push(`- Phase: ${t.phase}`);
        const who = [t.owner_label, t.side ? `Side: ${SIDE[t.side] ?? t.side}` : null].filter(Boolean).join(' · ');
        if (who) out.push(`- Who does it: ${who}`);
        if (t.assignee) out.push(`- Assigned to: ${t.assignee}`);
        if (t.deliverable) out.push(`- Done when: ${t.deliverable}`);
        if (t.labels?.length) out.push(`- Labels: ${t.labels.join(', ')}`);
        out.push(`- Link: ${link(t, ctx.origin)}`);
        if (t.description?.trim()) out.push('', t.description.trim());
      }
    }
  }
  return out.join('\n') + '\n';
}

export function tasksCsv(tasks: ExportTask[], ctx: ExportContext) {
  const head = ['Project', 'Client', 'Task', 'Status', 'Priority', 'Due', 'Days overdue', 'Phase', 'Who does it', 'Side', 'Assigned to', 'Done when', 'Labels', 'Details', 'Link'];
  const rows = [...tasks].sort(byDue).map((t) => {
    const late = t.status !== 'done' && t.due_on ? Math.max(0, -daysBetween(ctx.today, t.due_on)) : 0;
    return [t.project.name, t.project.client_name ?? '', t.title, STATUS[t.status] ?? t.status, cap(t.priority), t.due_on ?? '', late || '',
      t.phase ?? '', t.owner_label ?? '', t.side ? SIDE[t.side] ?? t.side : '', t.assignee ?? '', t.deliverable ?? '', (t.labels ?? []).join(', '),
      t.description ?? '', link(t, ctx.origin)];
  });
  return [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

export function downloadText(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
