import { motion } from 'framer-motion';
import { useAuth } from '@/app/auth';
import { Agent } from '@/agent/Agent';
import { PageHeader, Panel } from '@/ui/kit';
import { firstName, greeting } from '@/lib/format';

const COPY = {
  production: {
    title: 'Your production workspace',
    body: 'Projects, your team\'s progress, a Kanban board, sprints, a calendar, file and wireframe uploads — this is the next part of NUUKE being built. Your attendance and pay already work.',
    list: ['Team progress', 'My tasks', 'Kanban board', 'Sprints', 'Calendar', 'Files & wireframes', 'Content calendar'],
  },
  client: {
    title: 'Your project portal',
    body: 'Your project, its team, sprints, deliverables to review and a direct line to the people building it — coming very soon.',
    list: ['Project progress', 'Your team', 'Sprints', 'Things to review', 'Comments', 'Calendar'],
  },
};

export default function ComingSoonPage({ kind }: { kind: 'production' | 'client' }) {
  const { profile, agent } = useAuth();
  const c = COPY[kind];
  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Hi ${firstName(profile?.full_name)} 👋`} sub={c.title} />
      <Panel strong className="flex flex-col items-center gap-8 !p-10 text-center md:flex-row md:text-left">
        <Agent config={agent} size={180} mood="wave" />
        <div>
          <h2 className="text-2xl font-extrabold">{c.title} is on its way</h2>
          <p className="text-2 mt-2 max-w-xl">{c.body}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
            {c.list.map((x, i) => (
              <motion.span key={x} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="fill rounded-full px-3 py-1.5 text-[13px] font-semibold">{x}</motion.span>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}
