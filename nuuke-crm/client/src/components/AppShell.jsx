import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Mark, Wordmark } from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { initials } from '../lib/format.js';

/** Sections in the rail, and the boards beneath each. `roles` hides a whole section. */
export const SECTIONS = [
  {
    id: 'overview', label: 'Overview', icon: 'home',
    items: [
      { to: '/', label: 'My work', icon: 'home', end: true },
      { to: '/dashboard', label: 'Company dashboard', icon: 'grid' },
    ],
  },
  {
    id: 'sales', label: 'Sales', icon: 'target', roles: ['ADMIN', 'MANAGER'],
    items: [
      { to: '/board/leads', label: 'Lead inbox', icon: 'inbox', resource: 'leads' },
      { to: '/board/deals', label: 'Deal pipeline', icon: 'target', resource: 'deals' },
      { to: '/board/clients', label: 'Accounts', icon: 'users', resource: 'clients' },
      { to: '/board/contacts', label: 'Contacts', icon: 'person', resource: 'contacts' },
      { to: '/board/proposals', label: 'Proposals', icon: 'file', resource: 'proposals' },
      { to: '/board/invoices', label: 'Invoices', icon: 'money', resource: 'invoices' },
    ],
  },
  {
    id: 'delivery', label: 'Delivery', icon: 'rocket',
    items: [
      { to: '/board/projects', label: 'Projects', icon: 'rocket', resource: 'projects' },
      { to: '/board/sprints', label: 'Sprints', icon: 'layers', resource: 'sprints' },
      { to: '/board/tasks', label: 'Sprint board', icon: 'kanban', resource: 'tasks' },
      { to: '/board/milestones', label: 'Milestones', icon: 'flag', resource: 'milestones' },
      { to: '/roadmap', label: 'Portfolio roadmap', icon: 'gantt' },
      { to: '/squads', label: 'Squads & stages', icon: 'layers' },
    ],
  },
  {
    id: 'team', label: 'Team', icon: 'users',
    items: [
      { to: '/board/people', label: 'Team directory', icon: 'users', resource: 'people' },
      { to: '/capacity', label: 'Capacity planner', icon: 'chart', roles: ['ADMIN', 'MANAGER'] },
      { to: '/board/time_logs', label: 'Time tracking', icon: 'clock', resource: 'time_logs' },
      { to: '/board/leave_requests', label: 'Leave', icon: 'cal', resource: 'leave_requests' },
    ],
  },
  {
    id: 'quality', label: 'Quality', icon: 'shield',
    items: [
      { to: '/board/bugs', label: 'Bug tracker', icon: 'bug', resource: 'bugs' },
      { to: '/board/test_runs', label: 'QA test runs', icon: 'shield', resource: 'test_runs' },
      { to: '/board/releases', label: 'Releases', icon: 'build', resource: 'releases' },
    ],
  },
  {
    id: 'support', label: 'Support', icon: 'life',
    items: [
      { to: '/board/tickets', label: 'Support desk', icon: 'life', resource: 'tickets' },
      { to: '/board/approvals', label: 'Client approvals', icon: 'check', resource: 'approvals' },
    ],
  },
  {
    id: 'admin', label: 'Client portal & admin', icon: 'present',
    items: [
      { to: '/portal-preview', label: 'Portal preview', icon: 'present', roles: ['ADMIN', 'MANAGER'] },
      { to: '/users', label: 'Logins & roles', icon: 'cog', roles: ['ADMIN'] },
      { to: '/account', label: 'My account', icon: 'person' },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('nuuke:theme'); } catch { return null; }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);
  const toggle = () => {
    const isDark = theme
      ? theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('nuuke:theme', next); } catch { /* private mode */ }
  };
  return { theme, toggle };
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { can, ready } = useMeta();
  const { collection } = useData();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);

  const visibleSections = SECTIONS.filter((s) => !s.roles || s.roles.includes(user.role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles && !item.roles.includes(user.role)) return false;
        if (item.resource && ready && !can(item.resource, 'read')) return false;
        return true;
      }),
    }))
    .filter((s) => s.items.length);

  const active =
    visibleSections.find((s) => s.items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))) ??
    visibleSections[0];

  useEffect(() => { setPanelOpen(false); }, [location.pathname]);

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <div className="rail-mark"><Mark size={30} /></div>
        {visibleSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="rail-btn"
            aria-current={active?.id === section.id}
            aria-label={section.label}
            onClick={() => {
              navigate(section.items[0].to);
              if (window.innerWidth <= 1080) setPanelOpen(true);
            }}
          >
            <Icon name={section.icon} />
            <span className="rail-tip">{section.label}</span>
          </button>
        ))}
        <div className="rail-sp" />
        <button type="button" className="rail-btn" onClick={toggle} aria-label="Switch theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          <span className="rail-tip">Theme</span>
        </button>
        <button type="button" className="rail-btn" onClick={logout} aria-label="Sign out">
          <Icon name="logout" />
          <span className="rail-tip">Sign out</span>
        </button>
        <button type="button" className="avatar-btn" onClick={() => navigate('/account')} aria-label="My account">
          <span className="av" style={{ width: '100%', height: '100%' }}>{initials(user.name)}</span>
        </button>
      </nav>

      <aside className={`panel${panelOpen ? ' open' : ''}`} aria-label="Boards">
        <div className="panel-top">
          <div className="brandline">
            <Wordmark height={19} />
            <span>{active?.label ?? 'Nuuke'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {user.name} · <span style={{ textTransform: 'lowercase' }}>{user.role.toLowerCase()}</span>
          </div>
        </div>
        <div className="panel-scroll">
          <div className="nav-sec">{active?.label}</div>
          {active?.items.map((item) => {
            const count = item.resource ? collection(item.resource).length : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon name={item.icon} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {count ? <span className="cnt">{count}</span> : null}
              </NavLink>
            );
          })}
        </div>
      </aside>

      {panelOpen && <div className="scrim" onClick={() => setPanelOpen(false)} />}

      <main className="main">
        <Outlet context={{ openPanel: () => setPanelOpen(true) }} />
      </main>
    </div>
  );
}
