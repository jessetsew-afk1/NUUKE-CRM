import type { ReactNode } from 'react';
import {
  BarChart3, CalendarDays, ClipboardList, FileSpreadsheet, Gauge, Headphones, History, Kanban, LayoutDashboard,
  Settings, Shirt, Trophy, Users, Wallet, Clock, Inbox, Sparkles,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean; mobile?: boolean; short?: string }
export interface NavGroup { label: string; items: NavItem[] }

const i = (C: typeof Gauge) => <C className="size-[18px]" strokeWidth={2.1} />;

export function navFor(role: Role): NavGroup[] {
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
            { to: '/admin/leads', label: 'Leads & import', short: 'Leads', icon: i(FileSpreadsheet), mobile: true },
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
        { label: 'Production', items: [{ to: '/work', label: 'My workspace', short: 'Work', icon: i(Sparkles), mobile: true }] },
        me,
      ];
    default:
      return [{ label: 'Your project', items: [{ to: '/portal', label: 'Project', icon: i(Sparkles), mobile: true }] }, me];
  }
}
