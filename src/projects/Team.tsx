import { motion } from 'framer-motion';
import { Crown, Settings2 } from 'lucide-react';
import { clientsOf, teamOf, useTasks, type ProjectWithTeam } from '@/data/projects';
import { AgentAvatar } from '@/shell/AgentAvatar';
import { Button, Panel, PanelHeader, Pill, ProgressBar } from '@/ui/kit';
import { localISO } from '@/lib/format';

const weekAgo = () => new Date(Date.now() - 7 * 864e5).toISOString();

export function Team({ project, isClient, onManage }: { project: ProjectWithTeam; isClient: boolean; onManage?: () => void }) {
  const tasks = useTasks(project.id);
  const team = teamOf(project).sort((a, b) => Number(b.is_lead) - Number(a.is_lead));
  const clients = clientsOf(project);
  const today = localISO();
  const since = weekAgo();

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="The team" sub={isClient ? 'The people building your project.' : 'Who is on this project, and how their work is going.'}
          right={onManage && <Button variant="glass" size="sm" icon={<Settings2 className="size-4" />} onClick={onManage}>Manage people</Button>} />
        {team.length === 0 && <p className="text-3 text-[13px]">Nobody on the team yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((m, i) => {
            const mine = (tasks.data ?? []).filter((t) => t.assignee_id === m.profile_id);
            const open = mine.filter((t) => t.status !== 'done');
            const doneWeek = mine.filter((t) => t.completed_at && t.completed_at >= since).length;
            const overdue = open.filter((t) => t.due_on && t.due_on < today).length;
            return (
              <motion.div key={m.profile_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="fill rounded-[22px] p-4">
                <div className="flex items-center gap-3">
                  <AgentAvatar who={m.profile} size={56} animated />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-extrabold">{m.profile!.full_name}</span>
                      {m.is_lead && <Crown className="size-4 shrink-0 text-lemon" aria-label="Project lead" />}
                    </div>
                    <div className="text-2 truncate text-[13px]">{m.profile!.title ?? m.profile!.department}</div>
                    {m.is_lead && <Pill tone="iris" className="mt-1">Project lead</Pill>}
                  </div>
                </div>
                {!isClient && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div><div className="tabular text-[18px] font-extrabold">{open.length}</div><div className="text-3 text-[11px] font-bold">Open</div></div>
                      <div><div className="tabular text-[18px] font-extrabold text-ok">{doneWeek}</div><div className="text-3 text-[11px] font-bold">Done this week</div></div>
                      <div><div className={`tabular text-[18px] font-extrabold ${overdue ? 'text-bad' : ''}`}>{overdue}</div><div className="text-3 text-[11px] font-bold">Overdue</div></div>
                    </div>
                    <ProgressBar className="mt-3" value={mine.length - open.length} max={Math.max(1, mine.length)} height={6} glow={false} />
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </Panel>

      {!isClient && (
        <Panel>
          <PanelHeader title="Client side" sub="These logins see this project's portal: shared tasks, files to review, the calendars and messages." />
          {clients.length === 0 ? (
            <p className="text-3 text-[13px]">No client login on this project yet{onManage ? ' — add one from “Manage people”.' : '.'}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {clients.map((m) => (
                <div key={m.profile_id} className="fill flex items-center gap-3 rounded-[20px] py-2 pl-2 pr-4">
                  <AgentAvatar who={m.profile} size={40} />
                  <div>
                    <div className="text-[14px] font-bold">{m.profile!.full_name}</div>
                    <div className="text-3 text-[12px]">{m.profile!.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
