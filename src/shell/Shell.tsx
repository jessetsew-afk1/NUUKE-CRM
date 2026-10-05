import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  AlertTriangle, Bell, CheckCheck, ChevronRight, Coffee, LogOut, MoreHorizontal, Moon, Play, Shirt, Sun, Wallet,
} from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useAttendance, useLiveClock } from '@/app/attendance';
import { useNotifications } from '@/app/notifications';
import { useTheme } from '@/app/theme';
import { useToday } from '@/data/sales';
import { Agent } from '@/agent/Agent';
import { Button, IconButton, ProgressBar, Sheet, spring, useClickOutside } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { ago, clock, duration, firstName, greeting, time } from '@/lib/format';
import { defaultProject, usePendingReviews, useProjects, useUnread, useCurrentProject } from '@/data/projects';
import { ReviewDot } from '@/projects/bits';
import { ErrorBoundary } from '@/app/recovery';
import { navFor, type NavItem } from './nav';
import { gamesNeedingMe, useMyGames } from '@/data/games';
import { Logo } from './Logo';

const ROLE_LABEL = { admin: 'Admin', sales: 'Sales', production: 'Production', client: 'Client' } as const;

export function Shell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();
  const role = profile!.role;
  const projectsOn = role !== 'sales';
  const projects = useProjects(projectsOn);
  const pending = usePendingReviews(role === 'client');
  const unread = useUnread(projectsOn);
  const [current] = useCurrentProject();
  const projectId = defaultProject(projects.data, pending.data, current)?.id ?? null;
  const reviews = (pending.data ?? []).filter((f) => f.project_id === projectId).length;
  const unreadCount = (unread.data ?? []).reduce((s, u) => s + (role !== 'client' || u.project_id === projectId ? Number(u.unread) : 0), 0);
  const techManager = !!profile?.is_technical_manager;
  const myGames = useMyGames(role !== 'client');
  const need = gamesNeedingMe(myGames.data, profile?.id);
  const games = need.invites + need.myTurn;
  const groups = useMemo(() => navFor(role, { projectId, reviews, unread: unreadCount, techManager, games }), [role, projectId, reviews, unreadCount, techManager, games]);

  return (
    <div className="relative z-10 min-h-dvh">
      <Sidebar groups={groups} />
      <div className="lg:pl-[288px]">
        <TopBar />
        <SignOutReminder />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-32 pt-2 sm:px-6 lg:px-8 lg:pb-12">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* One page failing never takes the menu or the rest of the app down with it. */}
            <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
          </motion.div>
        </main>
      </div>
      <TabBar groups={groups} />
      <ShiftGate />
    </div>
  );
}

/* ================================================================= sidebar */
function Sidebar({ groups }: { groups: ReturnType<typeof navFor> }) {
  return (
    <aside className="glass fixed inset-y-4 left-4 z-30 hidden w-[256px] flex-col rounded-[30px] p-3 lg:flex">
      <div className="flex items-center gap-2.5 px-3 pb-5 pt-3">
        <Logo />
      </div>
      <nav className="scroll-y no-scrollbar -mx-1 flex-1 px-1">
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="text-3 mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em]">{g.label}</div>
            {g.items.map((item) => <SideLink key={item.to} item={item} />)}
          </div>
        ))}
      </nav>
      <UserCard />
    </aside>
  );
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end} className="relative block">
      {({ isActive }) => (
        <motion.div
          whileTap={{ scale: 0.97 }}
          transition={spring}
          className={clsx(
            'relative flex h-10 items-center gap-3 rounded-[14px] px-3 text-[14px] font-semibold transition-colors',
            isActive ? 'text-[color:var(--btn-text)]' : 'text-2 hover:bg-[var(--fill)] hover:text-[color:var(--text)]',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="side-active"
              transition={spring}
              className="absolute inset-0 rounded-[14px] bg-[var(--btn)] shadow-[0_8px_20px_-8px_rgba(11,11,16,0.5)]"
            />
          )}
          <span className="relative">{item.icon}</span>
          <span className="relative flex-1">{item.label}</span>
          <NavBadge item={item} />
        </motion.div>
      )}
    </NavLink>
  );
}

function NavBadge({ item, small }: { item: NavItem; small?: boolean }) {
  if (!item.badge) return null;
  if (item.urgent) return <ReviewDot size={small ? 'sm' : 'md'} count={item.badge} className="relative" />;
  return (
    <span className={clsx('relative grid min-w-[18px] place-items-center rounded-full bg-iris px-1 text-[10px] font-bold leading-[18px] text-white', small && 'scale-90')}>
      {item.badge > 99 ? '99+' : item.badge}
    </span>
  );
}

function UserCard() {
  const { profile, agent } = useAuth();
  const { state } = useAttendance();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const mood = state?.on_break ? 'sleepy' : 'idle';
  return (
    <div ref={ref} className="relative">
      <AnimatePresence>{open && <UserMenu onClose={() => setOpen(false)} placement="up" />}</AnimatePresence>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((o) => !o)}
        className="fill flex w-full items-center gap-3 rounded-[20px] p-2 pr-3 text-left hover:bg-[var(--fill-2)]"
      >
        <div className="relative">
          <Agent config={agent} size={44} mood={mood} />
          <StatusDot />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold">{profile?.full_name}</div>
          <div className="text-3 truncate text-[12px]">{profile?.title ?? ROLE_LABEL[profile!.role]}</div>
        </div>
        <MoreHorizontal className="text-3 size-4" />
      </motion.button>
    </div>
  );
}

function StatusDot() {
  const { tracksAttendance } = useAuth();
  const { state } = useAttendance();
  if (!tracksAttendance || !state) return null;
  const c = state.on_break ? '#FF9F0A' : state.clocked_in ? '#30C46C' : '#8E8AA0';
  return (
    <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-[var(--canvas)]">
      <span className="size-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
    </span>
  );
}

function UserMenu({ onClose, placement }: { onClose: () => void; placement: 'up' | 'down' }) {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = (to: string) => { navigate(to); onClose(); };
  return (
    <motion.div
      initial={{ opacity: 0, y: placement === 'up' ? 8 : -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: placement === 'up' ? 8 : -8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className={clsx(
        'glass-strong absolute z-50 w-[240px] rounded-[22px] p-1.5',
        placement === 'up' ? 'bottom-[calc(100%+8px)] left-0 origin-bottom-left' : 'right-0 top-[calc(100%+8px)] origin-top-right',
      )}
    >
      <MenuItem icon={<Shirt className="size-4" />} onClick={() => go('/me/agent')}>Dress up my agent</MenuItem>
      {profile?.role !== 'client' && <MenuItem icon={<Wallet className="size-4" />} onClick={() => go('/me/pay')}>Pay & attendance</MenuItem>}
      <MenuItem icon={theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />} onClick={toggle}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </MenuItem>
      <div className="hairline my-1 border-t" />
      <MenuItem
        icon={<LogOut className="size-4" />}
        danger
        onClick={async () => { setBusy(true); await signOut(); }}
      >
        {busy ? 'Signing out…' : profile?.role === 'client' || profile?.role === 'admin' ? 'Sign out' : 'Sign out & end shift'}
      </MenuItem>
    </motion.div>
  );
}

function MenuItem({ children, icon, onClick, danger }: { children: ReactNode; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] font-semibold hover:bg-[var(--fill-2)]', danger && 'text-bad')}
    >
      {icon}
      {children}
    </button>
  );
}

/* ================================================================== top bar */
function TopBar() {
  const { profile, agent } = useAuth();
  const { unread } = useNotifications();
  const [panel, setPanel] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setMenu(false), menu);

  return (
    <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2">
        <div className="lg:hidden"><Logo /></div>
        <div className="flex-1" />
        {profile?.role === 'sales' && <DialProgressPill />}
        <ShiftPill />
        <div className="glass flex items-center gap-1 rounded-[18px] p-1">
          <IconButton label="Notifications" badge={unread} onClick={() => setPanel(true)}>
            <Bell className="size-[19px]" />
          </IconButton>
          <div ref={ref} className="relative lg:hidden">
            <button type="button" onClick={() => setMenu((m) => !m)} className="block rounded-full" aria-label="Your menu">
              <Agent config={agent} size={38} animated={false} />
            </button>
            <AnimatePresence>{menu && <UserMenu onClose={() => setMenu(false)} placement="down" />}</AnimatePresence>
          </div>
        </div>
      </div>
      <NotificationsPanel open={panel} onClose={() => setPanel(false)} />
    </header>
  );
}

function DialProgressPill() {
  const { data } = useToday();
  const navigate = useNavigate();
  if (!data) return null;
  const done = data.dials >= data.target;
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate('/sales')}
      className="glass hidden h-12 items-center gap-3 rounded-[18px] px-4 md:flex"
      title="Numbers dialled today"
    >
      <div className="text-left">
        <div className="text-3 text-[10px] font-bold uppercase tracking-wider">Dialled today</div>
        <div className="tabular text-[14px] font-extrabold leading-tight">
          {data.dials}<span className="text-3 font-semibold"> / {data.target}</span>
        </div>
      </div>
      <ProgressBar value={data.dials} max={data.target} className="w-24" height={7} glow={!done} />
    </motion.button>
  );
}

function ShiftPill() {
  const { tracksAttendance } = useAuth();
  const { state, fetchedAt, startBreak, endBreak } = useAttendance();
  const live = useLiveClock(state, fetchedAt);
  const toast = useToast();
  if (!tracksAttendance || !state?.clocked_in) return null;

  const allowance = state.break_allowance_seconds;
  const over = live.breakUsed > allowance;

  if (state.on_break) {
    return (
      <motion.div layout className="glass flex h-12 items-center gap-2 rounded-[18px] pl-4 pr-1.5" style={{ boxShadow: '0 0 0 1.5px rgba(255,159,10,.5)' }}>
        <Coffee className="size-4 text-warn" />
        <div className="text-left">
          <div className="text-[10px] font-bold uppercase tracking-wider text-warn">On break</div>
          <div className={clsx('tabular text-[14px] font-extrabold leading-tight', over && 'text-bad')}>
            {clock(live.onBreak)} <span className="text-3 text-[12px] font-semibold">· {duration(Math.max(0, allowance - live.breakUsed))} left</span>
          </div>
        </div>
        <Button size="sm" variant="primary" className="ml-1 h-9" icon={<Play className="size-3.5" />} loading={endBreak.isPending}
          onClick={() => endBreak.mutate(undefined, { onSuccess: () => toast({ title: 'Welcome back', body: 'Break ended — the clock is running again.', tone: 'success' }) })}>
          Resume
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div layout className="glass flex h-12 items-center gap-2 rounded-[18px] pl-4 pr-1.5">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
      </span>
      <div className="text-left">
        <div className="text-3 text-[10px] font-bold uppercase tracking-wider">On shift</div>
        <div className="tabular text-[14px] font-extrabold leading-tight">{clock(live.worked)}</div>
      </div>
      <IconButton
        label={`Take a break (${duration(Math.max(0, allowance - live.breakUsed))} left today)`}
        className="ml-1"
        onClick={() => startBreak.mutate(undefined, { onError: (e) => toast({ title: e.message, tone: 'danger' }) })}
      >
        <Coffee className="size-[18px]" />
      </IconButton>
    </motion.div>
  );
}

/* ======================================================= the shift reminder */
function SignOutReminder() {
  const { tracksAttendance, signOut } = useAuth();
  const { state } = useAttendance();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!tracksAttendance || !state?.clocked_in || !state.scheduled_end) return null;
  const end = Date.parse(state.scheduled_end);
  if (now < end || state.arrival === 'off_schedule') return null;
  const autoAt = end + 60 * 60_000 + 5 * 60_000;
  const mins = Math.max(0, Math.round((autoAt - now) / 60_000));
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-3 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex flex-wrap items-center gap-3 rounded-[22px] px-4 py-3"
        style={{ boxShadow: '0 0 0 1.5px rgba(255,159,10,.55)' }}
      >
        <AlertTriangle className="size-5 text-warn" />
        <div className="min-w-0 flex-1 text-[14px]">
          <b>Your shift ended at {time(state.scheduled_end)}.</b>{' '}
          <span className="text-2">Sign out now — otherwise you will be signed out automatically in about {mins} min and your admin will be told.</span>
        </div>
        <Button size="sm" variant="primary" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>Sign out</Button>
      </motion.div>
    </div>
  );
}

/* =========================================================== the clock-in */
function ShiftGate() {
  const { tracksAttendance, profile, agent, signOut } = useAuth();
  const { state, clockIn } = useAttendance();
  const toast = useToast();
  if (!tracksAttendance || !state || state.clocked_in) return null;

  const start = state.scheduled_start ? Date.parse(state.scheduled_start) : null;
  const late = start ? Math.floor((Date.now() - start) / 60_000) : 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <motion.div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="glass-strong relative w-full max-w-[440px] rounded-[34px] p-8 text-center"
      >
        <div className="mx-auto w-fit"><Agent config={agent} size={150} mood="wave" /></div>
        <h2 className="mt-5 text-[26px] font-extrabold">{greeting()}, {firstName(profile?.full_name)}</h2>
        <p className="text-2 mt-1 text-[15px]">
          {state.first_in ? 'Welcome back — pick up where you left off.' : 'Ready when you are.'}
          {state.scheduled_start && <> Your shift starts at <b className="text-[color:var(--text)]">{time(state.scheduled_start)}</b>.</>}
        </p>
        {!state.first_in && late >= 15 && (
          <div className="mt-4 rounded-2xl bg-warn/15 px-4 py-3 text-[13px] font-semibold text-warn">
            You are {late} minutes late — this will be recorded.
          </div>
        )}
        <Button
          variant="primary"
          size="xl"
          block
          className="mt-6"
          icon={<Play className="size-5" />}
          loading={clockIn.isPending}
          onClick={() => clockIn.mutate(undefined, {
            onSuccess: (s) => toast({
              title: 'Shift started',
              body: s.arrival === 'on_time' || s.arrival === 'off_schedule' ? 'Have a great one.' : `Signed in ${s.late_minutes} min after your shift began.`,
              tone: s.arrival === 'on_time' || s.arrival === 'off_schedule' ? 'success' : 'warning',
            }),
            onError: (e) => toast({ title: e.message, tone: 'danger' }),
          })}
        >
          {state.first_in ? 'Resume my shift' : 'Start my shift'}
        </Button>
        <button type="button" onClick={() => void signOut()} className="text-3 mt-4 text-[13px] font-semibold hover:text-[color:var(--text)]">
          Not you? Sign out
        </button>
      </motion.div>
    </div>
  );
}

/* ============================================================ mobile tabs */
function TabBar({ groups }: { groups: ReturnType<typeof navFor> }) {
  const items = groups.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4);
  const rest = groups.flatMap((g) => g.items).filter((i) => !items.includes(i));
  const [more, setMore] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <nav className="glass fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[26px] px-2 py-1.5 lg:hidden" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="flex-1">
            {({ isActive }) => (
              <motion.div whileTap={{ scale: 0.9 }} className={clsx('relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5', isActive ? 'text-[color:var(--text)]' : 'text-3')}>
                {isActive && <motion.span layoutId="tab-active" transition={spring} className="absolute inset-x-2 inset-y-0 rounded-2xl bg-[var(--fill-2)]" />}
                <span className="relative">
                  {item.icon}
                  {!!item.badge && <span className="absolute -right-2 -top-1.5"><NavBadge item={item} small /></span>}
                </span>
                <span className="relative text-[10px] font-bold">{item.short ?? item.label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
        {rest.length > 0 && (
          <button type="button" onClick={() => setMore(true)} className="text-3 flex flex-1 flex-col items-center gap-0.5 py-1.5">
            <MoreHorizontal className="size-[18px]" />
            <span className="text-[10px] font-bold">More</span>
          </button>
        )}
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid gap-1">
          {rest.map((item) => (
            <button key={item.to} type="button" onClick={() => { navigate(item.to); setMore(false); }}
              className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold hover:bg-[var(--fill-2)]">
              {item.icon}<span className="flex-1">{item.label}</span><ChevronRight className="text-3 size-4" />
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/* ========================================================= notifications */
const TONE_DOT: Record<string, string> = { info: '#0A84FF', success: '#30C46C', warning: '#FF9F0A', danger: '#FF453A', celebrate: '#7C5CFF' };

function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, unread, markAllRead, markRead } = useNotifications();
  const navigate = useNavigate();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[4px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="glass-strong absolute bottom-3 right-3 top-3 flex w-[min(420px,calc(100vw-24px))] flex-col rounded-[30px]"
          >
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <div>
                <h2 className="text-xl font-extrabold">Notifications</h2>
                <p className="text-3 text-[13px]">{unread ? `${unread} unread` : 'All caught up'}</p>
              </div>
              {unread > 0 && (
                <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} onClick={() => void markAllRead()}>Mark all read</Button>
              )}
            </div>
            <div className="scroll-y flex-1 px-3 pb-3">
              {items.length === 0 && <p className="text-3 px-3 py-10 text-center text-sm">Nothing yet. Alerts about your leads, shifts and wins land here.</p>}
              {items.map((n, idx) => (
                <motion.button
                  key={n.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx, 10) * 0.025 }}
                  onClick={() => {
                    if (!n.read_at) void markRead([n.id]);
                    if (n.link) { navigate(n.link); onClose(); }
                  }}
                  className={clsx('flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left hover:bg-[var(--fill)]', !n.read_at && 'bg-[var(--fill)]')}
                >
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: n.read_at ? 'transparent' : TONE_DOT[n.tone] ?? '#0A84FF', boxShadow: n.read_at ? 'inset 0 0 0 1.5px var(--fill-2)' : undefined }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-snug">{n.title}</span>
                    {n.body && <span className="text-2 mt-0.5 block text-[13px] leading-snug">{n.body}</span>}
                    <span className="text-3 mt-1 block text-[12px]">{ago(n.created_at)}</span>
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
