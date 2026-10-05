import type { ReactNode } from 'react';
import {
  BarChart3, CalendarDays, ClipboardList, Columns3, Eye, FileSpreadsheet, FolderKanban, Gauge, Headphones, History, Kanban,
  LayoutDashboard, ListTodo, Megaphone, MessagesSquare, Rocket, Settings, Shirt, Trophy, Users, Video, Wallet, Clock, Inbox, Sparkles,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string; label: string; icon: ReactNode; end?: boolean; mobile?: boolean; short?: string;
  /** A count on the item; `urgent` makes it the pulsing red dot. */
  badge?: number; urgent?: boolean;
}
export interface NavContext { projectId?: number | null; reviews?: number; unread?: number; techManager?: boolean }
export interface NavGroup { label: string; items: NavItem[] }

const i = (C: typeof Gauge) => <C className="size-[18px]" strokeWidth={2.1} />;

export function navFor(role: Role, ctx: NavContext = {}): NavGroup[] {
  const groups = baseNav(role, ctx);
  // Technical managers (any staff role) get their client meetings.
  if (ctx.techManager && role !== 'client') {
    groups[0].items.push({ to: '/meetings/tech', label: 'Client meetings', short: 'Meetings', icon: i(Video) });
  }
  return groups;
}

function baseNav(role: Role, ctx: NavContext): NavGroup[] {
  const me: NavGroup = {
    label: 'You',
    items: [
      { to: '/me/agent', label: 'My agent', icon: i(Shirt) },
      ...(role !== 'client' ? [{ to: '/me/pay', label: 'Pay & attendance', icon: i(Wallet) }] : []),
    ],
  };
  switch (role) {
    case 'sales':
      return [
        {
          label: 'Sales',
          items: [
            { to: '/sales', label: 'Dialer', icon: i(Headphones), end: true, mobile: true },
            { to: '/sales/leads', label: 'My leads', short: 'Leads', icon: i(Inbox), mobile: true },
            { to: '/sales/pipeline', label: 'Pipeline', icon: i(Kanban), mobile: true },
            { to: '/sales/meetings', label: 'Meetings', icon: i(CalendarDays) },
            { to: '/sales/log', label: 'Call log', icon: i(History) },
            { to: '/sales/analytics', label: 'Analytics', short: 'Stats', icon: i(BarChart3), mobile: true },
            { to: '/leaderboard', label: 'Leaderboard', icon: i(Trophy) },
          ],
        },
        me,
      ];
    case 'admin':
      return [
        {
          label: 'Company',
          items: [
            { to: '/admin', label: 'Overview', icon: i(LayoutDashboard), end: true, mobile: true },
            { to: '/admin/sales', label: 'Sales floor', short: 'Sales', icon: i(Gauge), mobile: true },
            { to: '/admin/meetings', label: 'Meetings calendar', short: 'Meetings', icon: i(CalendarDays) },
            { to: '/projects', label: 'Projects', icon: i(FolderKanban), mobile: true, badge: ctx.unread },
            { to: '/admin/leads', label: 'Leads & import', short: 'Leads', icon: i(FileSpreadsheet) },
            { to: '/leaderboard', label: 'Leaderboard', icon: i(Trophy) },
          ],
        },
        {
          label: 'People',
          items: [
            { to: '/admin/people', label: 'Team & access', short: 'Team', icon: i(Users), mobile: true },
            { to: '/admin/attendance', label: 'Attendance', icon: i(Clock) },
            { to: '/admin/payroll', label: 'Payroll', icon: i(Wallet) },
            { to: '/admin/audit', label: 'Activity log', icon: i(ClipboardList) },
            { to: '/admin/settings', label: 'Rules & settings', icon: i(Settings) },
          ],
        },
        { label: 'You', items: [{ to: '/me/agent', label: 'My agent', icon: i(Shirt) }] },
      ];
    case 'production':
      return [
        {
          label: 'Production',
          items: [
            { to: '/work', label: 'My workspace', short: 'Home', icon: i(Sparkles), end: true, mobile: true },
            { to: '/projects', label: 'Projects', icon: i(FolderKanban), mobile: true, badge: ctx.unread },
            { to: '/work/tasks', label: 'My tasks', short: 'Tasks', icon: i(ListTodo), mobile: true },
            { to: '/work/calendar', label: 'Calendar', icon: i(CalendarDays), mobile: true },
          ],
        },
        me,
      ];
    default: {
      const base = ctx.projectId ? `/projects/${ctx.projectId}` : '/portal';
      return [
        {
          label: 'Your project',
          items: [
            { to: base, label: 'Overview', icon: i(LayoutDashboard), end: true, mobile: true },
            { to: `${base}/files`, label: 'Reviews & files', short: 'Reviews', icon: i(Eye), mobile: true, badge: ctx.reviews, urgent: true },
            { to: `${base}/board`, label: 'Progress board', short: 'Board', icon: i(Columns3), mobile: true },
            { to: `${base}/messages`, label: 'Messages', icon: i(MessagesSquare), mobile: true, badge: ctx.unread },
            { to: `${base}/calendar`, label: 'Calendar', icon: i(CalendarDays) },
            { to: `${base}/content`, label: 'Content calendar', icon: i(Megaphone) },
            { to: `${base}/sprints`, label: 'Sprints', icon: i(Rocket) },
            { to: `${base}/team`, label: 'Your team', icon: i(Users) },
          ],
        },
        me,
      ];
    }
  }
}
