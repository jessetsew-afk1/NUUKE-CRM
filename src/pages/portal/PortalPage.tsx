import { Navigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { Agent } from '@/agent/Agent';
import { defaultProject, readCurrentProject, usePendingReviews, useProjects } from '@/data/projects';
import { Panel, Skeleton } from '@/ui/kit';
import { firstName } from '@/lib/format';

/** A client's way in: straight to the project they looked at last (or their only one). */
export default function PortalPage() {
  const { tab } = useParams();
  const { profile, agent } = useAuth();
  const projects = useProjects();
  const pending = usePendingReviews();

  if (projects.isLoading || pending.isLoading) return <Skeleton className="h-[60vh] rounded-[30px]" />;
  const pick = defaultProject(projects.data, pending.data, readCurrentProject());
  if (pick) return <Navigate to={`/projects/${pick.id}${tab ? `/${tab}` : ''}`} replace />;

  return (
    <Panel strong className="flex flex-col items-center gap-8 !p-10 text-center md:flex-row md:text-left">
      <Agent config={agent} size={170} mood="wave" />
      <div>
        <div className="mb-1 flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-iris md:justify-start"><Sparkles className="size-4" />Welcome to NUUKE</div>
        <h1 className="text-[28px] font-extrabold">Hi {firstName(profile?.full_name)} 👋</h1>
        <p className="text-2 mt-2 max-w-lg text-[15px]">
          Your project is being set up. As soon as the team adds you to it, you'll see its progress, the people building it,
          everything that needs your review, and a direct line to the team — right here.
        </p>
      </div>
    </Panel>
  );
}
