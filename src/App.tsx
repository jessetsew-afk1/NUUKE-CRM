import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { NotificationsProvider } from '@/app/notifications';
import { supabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/lib/types';
import { Shell } from '@/shell/Shell';
import { Aurora } from '@/shell/Aurora';
import { Splash } from '@/shell/Splash';
import LoginPage from '@/pages/LoginPage';
import SetupPage from '@/pages/SetupPage';

const DialerPage = lazy(() => import('@/pages/sales/DialerPage'));
const LeadsPage = lazy(() => import('@/pages/sales/LeadsPage'));
const PipelinePage = lazy(() => import('@/pages/sales/PipelinePage'));
const MeetingsPage = lazy(() => import('@/pages/sales/MeetingsPage'));
const ActivityPage = lazy(() => import('@/pages/sales/ActivityPage'));
const AnalyticsPage = lazy(() => import('@/pages/sales/AnalyticsPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const AgentPage = lazy(() => import('@/pages/me/AgentPage'));
const PayPage = lazy(() => import('@/pages/me/PayPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ProjectPage = lazy(() => import('@/projects/ProjectPage'));
const FileViewer = lazy(() => import('@/projects/FileViewer'));
const WorkspacePage = lazy(() => import('@/pages/work/WorkspacePage'));
const MyTasksPage = lazy(() => import('@/pages/work/MyTasksPage'));
const WorkCalendarPage = lazy(() => import('@/pages/work/WorkCalendarPage'));
const PortalPage = lazy(() => import('@/pages/portal/PortalPage'));
const AdminHome = lazy(() => import('@/pages/admin/AdminHome'));
const AdminSales = lazy(() => import('@/pages/admin/AdminSales'));
const AdminLeads = lazy(() => import('@/pages/admin/AdminLeads'));
const AdminPeople = lazy(() => import('@/pages/admin/AdminPeople'));
const AdminAttendance = lazy(() => import('@/pages/admin/AdminAttendance'));
const AdminPayroll = lazy(() => import('@/pages/admin/AdminPayroll'));
const AdminAudit = lazy(() => import('@/pages/admin/AdminAudit'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));

export const HOME: Record<Role, string> = { admin: '/admin', sales: '/sales', production: '/work', client: '/portal' };

function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) return <Navigate to={profile ? HOME[profile.role] : '/login'} replace />;
  return <>{children}</>;
}

export default function App() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (!supabaseConfigured) return <><Aurora /><SetupPage /></>;
  if (loading) return <><Aurora /><Splash /></>;

  if (!session) {
    return (
      <>
        <Aurora />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
        </Routes>
      </>
    );
  }

  if (!profile) return <><Aurora /><SetupPage noProfile /></>;
  if (!profile.is_active) return <><Aurora /><SetupPage inactive /></>;

  const S: Role[] = ['sales'];
  const A: Role[] = ['admin'];
  const STAFF: Role[] = ['admin', 'sales', 'production'];

  return (
    <NotificationsProvider>
      <Aurora />
      <Shell>
        <Suspense fallback={<Splash inline />}>
          <Routes>
            <Route path="/" element={<Navigate to={HOME[profile.role]} replace />} />
            <Route path="/login" element={<Navigate to={HOME[profile.role]} replace />} />

            <Route path="/sales" element={<Only roles={S}><DialerPage /></Only>} />
            <Route path="/sales/leads" element={<Only roles={S}><LeadsPage /></Only>} />
            <Route path="/sales/pipeline" element={<Only roles={S}><PipelinePage /></Only>} />
            <Route path="/sales/meetings" element={<Only roles={S}><MeetingsPage /></Only>} />
            <Route path="/sales/log" element={<Only roles={S}><ActivityPage /></Only>} />
            <Route path="/sales/analytics" element={<Only roles={S}><AnalyticsPage /></Only>} />
            <Route path="/leaderboard" element={<Only roles={['admin', 'sales']}><LeaderboardPage /></Only>} />

            <Route path="/me/agent" element={<AgentPage />} />
            <Route path="/me/pay" element={<Only roles={STAFF}><PayPage /></Only>} />

            <Route path="/work" element={<Only roles={['production']}><WorkspacePage /></Only>} />
            <Route path="/work/tasks" element={<Only roles={['production', 'admin']}><MyTasksPage /></Only>} />
            <Route path="/work/calendar" element={<Only roles={['production', 'admin']}><WorkCalendarPage /></Only>} />
            <Route path="/projects" element={<Only roles={['production', 'admin']}><ProjectsPage /></Only>} />
            <Route path="/projects/:id/files/:fileId" element={<FileViewer />} />
            <Route path="/projects/:id/:tab?" element={<ProjectPage />} />
            <Route path="/portal/:tab?" element={<Only roles={['client']}><PortalPage /></Only>} />

            <Route path="/admin" element={<Only roles={A}><AdminHome /></Only>} />
            <Route path="/admin/sales" element={<Only roles={A}><AdminSales /></Only>} />
            <Route path="/admin/leads" element={<Only roles={A}><AdminLeads /></Only>} />
            <Route path="/admin/people" element={<Only roles={A}><AdminPeople /></Only>} />
            <Route path="/admin/attendance" element={<Only roles={A}><AdminAttendance /></Only>} />
            <Route path="/admin/payroll" element={<Only roles={A}><AdminPayroll /></Only>} />
            <Route path="/admin/audit" element={<Only roles={A}><AdminAudit /></Only>} />
            <Route path="/admin/settings" element={<Only roles={A}><AdminSettings /></Only>} />

            <Route path="*" element={<Navigate to={HOME[profile.role]} replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </NotificationsProvider>
  );
}
