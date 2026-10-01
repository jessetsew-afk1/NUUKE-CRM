#!/usr/bin/env node
/**
 * Exercises the database rules as real users would hit them (run after `npm run seed`).
 * Every check prints ✓ or ✗; exits non-zero if any fail.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = process.env.SEED_PASSWORD ?? 'NuukeDemo!2026';
let failed = 0;
const ok = (cond, label, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `  — ${extra}` : ''}`);
};
async function as(email) {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  const { data } = await c.auth.getUser();
  return { c, id: data.user.id };
}

const zoya = await as('zoya@nuuke.test');
const hamza = await as('hamza@nuuke.test');
const admin = await as('admin@nuuke.test');
const faisal = await as('faisal@nuuke.test');

// ---- visibility
{
  const { count } = await zoya.c.from('leads').select('*', { count: 'exact', head: true });
  const { count: mine } = await zoya.c.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', zoya.id);
  ok(count === mine && count > 0, 'A rep sees only leads assigned to them', `${count} visible`);
  const { count: hamzaLeads } = await zoya.c.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', hamza.id);
  ok(hamzaLeads === 0, "A rep cannot read a colleague's leads");
  const { data: deals } = await zoya.c.from('deals').select('owner_id');
  ok(deals.every((d) => d.owner_id === zoya.id), 'A rep sees only their own deals', `${deals.length} deals`);
  const { data: emp } = await zoya.c.from('employment').select('profile_id');
  ok(emp.length === 1 && emp[0].profile_id === zoya.id, "A rep cannot see anyone else's salary");
  const { data: profiles } = await zoya.c.from('profiles').select('id');
  ok(profiles.length >= 9, 'Staff can see colleagues (names and agents)');
  const { data: audit } = await zoya.c.from('audit_log').select('id').limit(1);
  ok(audit.length === 0, 'A rep cannot read the audit log');
  const { count: prodLeads } = await faisal.c.from('leads').select('*', { count: 'exact', head: true });
  ok(prodLeads === 0, 'Production staff cannot see any leads');
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { count: allLeads } = await service.from('leads').select('*', { count: 'exact', head: true });
  const { count: adminLeads } = await admin.c.from('leads').select('*', { count: 'exact', head: true });
  ok(adminLeads === allLeads && allLeads > 0, 'The admin sees every lead', `${adminLeads} of ${allLeads}`);
}

// ---- writes a rep must not be able to make
{
  const { error } = await zoya.c.from('profiles').update({ role: 'admin' }).eq('id', zoya.id);
  ok(!!error, 'A rep cannot make themselves admin', error?.message);
  const { error: e2 } = await zoya.c.from('profiles').update({ avatar: { hat: 'crown' } }).eq('id', zoya.id);
  ok(!!e2 && /locked/.test(e2.message), 'A locked wardrobe item is refused', e2?.message);
  const { error: e3 } = await zoya.c.from('profiles').update({ avatar: { hat: 'beanie', skin: 's2' } }).eq('id', zoya.id);
  ok(!e3, 'A rep can restyle their own agent');
  const { data: hl } = await admin.c.from('leads').select('id').eq('assigned_to', hamza.id).limit(1).single();
  const { error: e4 } = await zoya.c.rpc('log_lead_action', { p_lead_id: hl.id, p_action: 'call', p_outcome: 'voicemail' });
  ok(!!e4, "A rep cannot log a call on a colleague's lead", e4?.message);
  const { data: upd } = await zoya.c.from('leads').update({ assigned_to: zoya.id }).eq('id', hl.id).select();
  ok(!upd?.length, 'A rep cannot reassign a lead to themselves');
  const { error: e5 } = await zoya.c.rpc('assign_leads', { p_lead_ids: [hl.id], p_reps: [zoya.id] });
  ok(!!e5, 'A rep cannot call admin lead assignment');
  const { error: e6 } = await zoya.c.from('deals').insert({ title: 'Sneaky', owner_id: hamza.id }).select().single();
  const { data: sneaky } = await admin.c.from('deals').select('owner_id').eq('title', 'Sneaky').maybeSingle();
  ok(!e6 && sneaky?.owner_id === zoya.id, 'A deal a rep creates is always theirs, whatever they send');
  await admin.c.from('deals').delete().eq('title', 'Sneaky');
  const { error: e7 } = await zoya.c.rpc('payroll_compute', { p_profile: hamza.id });
  ok(!!e7, "A rep cannot see a colleague's pay");
  const { error: e8 } = await faisal.c.from('deals').insert({ title: 'Prod deal' });
  ok(!!e8, 'Production staff cannot create deals');
  const { error: e9 } = await zoya.c.rpc('run_sweeps');
  ok(!!e9, 'Background sweeps cannot be triggered from the browser');
  const { error: e10 } = await zoya.c.rpc('notify', { p_user: hamza.id, p_kind: 'x', p_title: 'spam' });
  ok(!!e10, 'A user cannot send notifications to others');
}

// ---- attendance
{
  const { data: a0 } = await zoya.c.rpc('my_attendance');
  ok(a0 && a0.tracks_attendance === true && a0.clocked_in === false, 'Attendance state loads (not yet clocked in)');
  const { data: a1, error } = await zoya.c.rpc('clock_in');
  ok(!error && a1.clocked_in, 'Clock in works', error?.message ?? `arrival ${a1?.arrival}, work date ${a1?.work_date}`);
  const { data: a2 } = await zoya.c.rpc('start_break');
  ok(a2.on_break, 'Break starts');
  const { data: a3 } = await zoya.c.rpc('end_break');
  ok(!a3.on_break, 'Break ends');
}

// ---- the dialer
{
  const { data: summary } = await zoya.c.rpc('queue_summary', {});
  ok(summary.total > 0, 'Queue summary', JSON.stringify(summary));
  const { data: next } = await zoya.c.rpc('next_leads', { p_limit: 3 });
  ok(next.length === 3, 'Next three cards come back', next.map((l) => `${l.name} (attempt ${l.attempts + 1})`).join(', '));
  const first = next[0];
  const { data: skip } = await zoya.c.rpc('log_lead_action', { p_lead_id: first.id, p_action: 'skip' });
  const { data: after } = await zoya.c.rpc('next_leads', { p_limit: 50 });
  ok(after[0].id !== first.id, 'A skipped card goes to the back of the queue', `skips today ${skip.today.skips}`);
  const card = after[0];
  const { data: done, error } = await zoya.c.rpc('log_lead_action', {
    p_lead_id: card.id, p_action: 'call', p_outcome: 'contact_not_established', p_comment: 'Rang out',
  });
  ok(!error && done.lead.next_action_at, 'No contact → follow-up scheduled for the next shift', done?.lead?.next_action_at);
  const { error: noTime } = await zoya.c.rpc('log_lead_action', { p_lead_id: after[1].id, p_action: 'call', p_outcome: 'busy_callback' });
  ok(!!noTime, 'Call-back without a time is refused', noTime?.message);
  const meetAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const { data: meet, error: meetErr } = await zoya.c.rpc('log_lead_action', {
    p_lead_id: after[1].id, p_action: 'call', p_outcome: 'meeting_booked', p_meeting_at: meetAt, p_comment: 'Booked with founder',
  });
  ok(!meetErr && meet.lead.stage === 'pipeline' && meet.lead.deal_id, 'Meeting booked → deal + meeting created', meetErr?.message);
  const { data: m } = await zoya.c.from('meetings').select('id').eq('lead_id', after[1].id);
  ok(m.length === 1, 'The meeting is on her calendar');
  const { data: dnc } = await zoya.c.rpc('log_lead_action', { p_lead_id: after[2].id, p_action: 'call', p_outcome: 'do_not_call' });
  ok(dnc.lead.stage === 'closed', 'Do not call → removed from the queue');
  ok(dnc.today.dials >= 3, "Today's dial count moves", JSON.stringify(dnc.today));
}

// ---- numbers
{
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const { data: stats, error } = await zoya.c.rpc('sales_stats', { p_user: zoya.id, p_from: from, p_to: to });
  ok(!error && stats.totals.dials > 0, 'Sales stats', error?.message ?? JSON.stringify(stats.totals));
  const { error: e2 } = await zoya.c.rpc('sales_stats', { p_user: hamza.id, p_from: from, p_to: to });
  ok(!!e2, "A rep cannot pull a colleague's stats");
  const { data: lb, error: e3 } = await zoya.c.rpc('sales_leaderboard', { p_from: from, p_to: to });
  ok(!e3 && lb.length === 5, 'Leaderboard shows the five reps', lb?.map((r) => `${r.full_name.split(' ')[0]} $${r.won_usd}`).join(', '));
  const { data: pay, error: e4 } = await zoya.c.rpc('payroll_compute', { p_profile: zoya.id });
  ok(!e4 && pay.net_pkr > 0, 'Payroll for this period', e4?.message ?? `${pay.sales.tier}, closed $${pay.sales.closed_usd} of $${pay.sales.target_usd}, net PKR ${pay.net_pkr}`);
  const { data: bilal } = await admin.c.rpc('payroll_overview', {});
  for (const p of bilal) {
    console.log(`    ${p.full_name.padEnd(15)} salary ${String(p.monthly_salary_pkr).padStart(7)}  deductions ${String(p.deduction_days).padStart(4)}d  ${p.sales ? `${p.sales.tier.padEnd(10)} $${p.sales.closed_usd}/${p.sales.target_usd}` : ''.padEnd(10)}  net ${p.net_pkr}`);
  }
  const { data: board, error: e5 } = await admin.c.rpc('attendance_board', {});
  ok(!e5 && board.length === 8, 'Admin attendance board', board?.map((b) => `${b.full_name.split(' ')[0]}:${b.state}`).join(' '));
  const { data: unlocks, error: e6 } = await zoya.c.rpc('check_agent_unlocks');
  ok(!e6, 'Agent unlocks evaluate', JSON.stringify(unlocks));
}


// ---- projects: who sees what
{
  const umar = await as('umar@nuuke.test');
  const sarah = await as('sarah@halcyon.test');
  const leo = await as('leo@brightbrew.test');
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const names = async (u) => (await u.c.from('projects').select('name').order('name')).data.map((p) => p.name);

  const f = await names(faisal);
  ok(f.length === 2 && f.every((n) => n.startsWith('Halcyon')), 'Production sees only the projects they are on', f.join(', '));
  ok((await names(umar)).length === 3, 'Another teammate sees their own three projects');
  const sp = await names(sarah);
  ok(sp.length === 2, 'A client sees only their projects (and can switch between them)', sp.join(', '));
  ok((await names(leo)).join() === 'BrightBrew Launch Campaign', "Another client sees only theirs");
  ok((await names(zoya)).length === 0, 'Sales sees no projects');
  ok((await names(admin)).length === 4, 'The admin sees every project');

  const { data: app } = await service.from('projects').select('id').eq('name', 'Halcyon Patient App').single();
  const { data: brew } = await service.from('projects').select('id').eq('name', 'BrightBrew Launch Campaign').single();
  const { count: hiddenAll } = await service.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', app.id).eq('client_visible', false);
  const { data: sTasks } = await sarah.c.from('tasks').select('client_visible').eq('project_id', app.id);
  ok(hiddenAll > 0 && sTasks.length > 0 && sTasks.every((t) => t.client_visible), 'A client never sees internal tasks', `${sTasks.length} visible, ${hiddenAll} hidden`);
  const { data: sFiles } = await sarah.c.from('project_files').select('title, client_visible').eq('project_id', app.id);
  ok(sFiles.every((x) => x.client_visible) && !sFiles.some((x) => /internal/i.test(x.title)), 'A client never sees internal files');
  const { data: leoSees } = await leo.c.from('project_files').select('id').eq('project_id', app.id);
  const { data: leoMsgs } = await leo.c.from('project_messages').select('id').eq('project_id', app.id);
  ok(leoSees.length === 0 && leoMsgs.length === 0, "A client cannot see another client's files or messages");
  const { data: leoPeople } = await leo.c.from('profiles').select('email');
  const emails = leoPeople.map((p) => p.email);
  ok(emails.includes('umar@nuuke.test') && !emails.includes('faisal@nuuke.test') && !emails.includes('zoya@nuuke.test'),
    'A client sees their own team, not the rest of the company', emails.join(', '));
  const { data: emp } = await leo.c.from('employment').select('profile_id');
  ok(emp.length === 0, "A client cannot see anyone's salary");

  // writes
  const { data: oneTask } = await sarah.c.from('tasks').select('id, title').eq('project_id', app.id).limit(1).single();
  const { data: upd } = await sarah.c.from('tasks').update({ title: 'hacked' }).eq('id', oneTask.id).select();
  ok(!upd?.length, 'A client cannot edit tasks');
  const { error: ins } = await sarah.c.from('tasks').insert({ project_id: app.id, title: 'Sneaky' });
  ok(!!ins, 'A client cannot add tasks to the board');
  const { error: selfAdd } = await faisal.c.from('project_members').insert({ project_id: brew.id, profile_id: faisal.id });
  ok(!!selfAdd, 'Production cannot add themselves to a project');
  const { error: toClient } = await faisal.c.from('tasks').insert({ project_id: app.id, title: 'For the client', assignee_id: sarah.id });
  ok(!!toClient, 'Tasks can only go to people on the team', toClient?.message);
  const { error: notMine } = await faisal.c.from('tasks').insert({ project_id: brew.id, title: 'Wrong project' });
  ok(!!notMine, "Production cannot add tasks to a project they're not on");

  // the review
  const { data: pending } = await service.from('project_files').select('id, title').eq('project_id', app.id).eq('review_status', 'pending').order('id').limit(1).single();
  const { error: fakeApprove } = await faisal.c.rpc('review_file', { p_file: pending.id, p_decision: 'approved' });
  ok(!!fakeApprove, 'The team cannot approve on the client\'s behalf', fakeApprove?.message);
  const { error: directApprove } = await faisal.c.from('project_files').update({ review_status: 'approved' }).eq('id', pending.id);
  ok(!!directApprove, '…not even by editing the file directly', directApprove?.message);
  const { error: noNote } = await sarah.c.rpc('review_file', { p_file: pending.id, p_decision: 'changes_requested' });
  ok(!!noNote, 'Asking for changes needs a note', noNote?.message);
  const { data: reviewed, error: rev } = await sarah.c.rpc('review_file', { p_file: pending.id, p_decision: 'approved', p_note: 'Ship it' });
  ok(!rev && reviewed.review_status === 'approved', 'The client approves a deliverable', rev?.message ?? pending.title);
  const { data: told } = await service.from('notifications').select('user_id, kind').eq('kind', 'review_done').eq('user_id', faisal.id).gte('created_at', new Date(Date.now() - 60_000).toISOString());
  ok(told.length > 0, 'The team is told the moment the client decides');
  await service.from('project_files').update({ review_status: 'pending' }).eq('id', pending.id);

  // files in storage
  const { data: img } = await service.from('project_files').select('storage_path').eq('project_id', app.id).not('storage_path', 'is', null).eq('client_visible', true).limit(1).single();
  const { error: own } = await sarah.c.storage.from('project-files').createSignedUrl(img.storage_path, 60);
  ok(!own, 'A client can open files shared with them', own?.message);
  const { error: other } = await leo.c.storage.from('project-files').createSignedUrl(img.storage_path, 60);
  ok(!!other, "A client cannot open another client's files", other?.message);
  const { error: up } = await leo.c.storage.from('project-files').upload(`${app.id}/sneaky.txt`, new Blob(['x']), { contentType: 'text/plain' });
  ok(!!up, "Nobody can upload into a project they're not on");

  // messages
  const { error: msgErr } = await leo.c.from('project_messages').insert({ project_id: brew.id, body: 'Rule check — please ignore', author_id: leo.id });
  const { data: ping } = await service.from('notifications').select('user_id').eq('kind', 'client_message').gte('created_at', new Date(Date.now() - 60_000).toISOString());
  const pinged = new Set(ping.map((n) => n.user_id));
  ok(!msgErr && pinged.has(umar.id) && pinged.has(admin.id) && !pinged.has(faisal.id), 'A client message alerts that team and the admins only');
  await service.from('project_messages').delete().eq('body', 'Rule check — please ignore');
  await service.from('notifications').delete().eq('kind', 'client_message').gte('created_at', new Date(Date.now() - 60_000).toISOString());
}

// ---- clean up the clock-in so the demo starts fresh
await zoya.c.rpc('clock_out');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
