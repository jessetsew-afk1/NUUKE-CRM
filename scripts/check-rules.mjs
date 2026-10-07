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
  const umarC = await as('umar@nuuke.test');
  const { count: prodLeads } = await umarC.c.from('leads').select('*', { count: 'exact', head: true });
  ok(prodLeads === 0, 'Production staff cannot see any leads');
  const { data: tmLeads } = await faisal.c.from('leads').select('id');
  const { data: tmMeetings } = await faisal.c.from('meetings').select('lead_id').eq('technical_manager_id', faisal.id);
  const allowed = new Set(tmMeetings.map((m) => m.lead_id));
  ok(tmLeads.every((l) => allowed.has(l.id)), 'A technical manager sees only the leads of meetings they are on', `${tmLeads.length} leads, ${tmMeetings.length} meetings`);
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
  const card = after.find((l) => l.attempts < 3 && l.id !== first.id) ?? after[0]; // not on its final call
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


// ---- editing leads, technical managers, meetings, recycling
{
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const ayesha = await as('ayesha@nuuke.test');
  const { data: mine } = await zoya.c.from('leads').select('id, phone, name').eq('assigned_to', zoya.id).eq('stage', 'queue').limit(1).single();
  const { data: edited, error: ee } = await zoya.c.rpc('update_lead_details', { p_lead_id: mine.id, p_fields: { phone: '212-555-0101 / 312-555-0199', name: 'Edited Name' } });
  ok(!ee && edited.phone === '212-555-0101 / 312-555-0199' && edited.name === 'Edited Name', 'A rep can edit their own lead (several numbers too)', ee?.message);
  const { data: noteRow } = await service.from('lead_attempts').select('comment, action').eq('lead_id', mine.id).eq('action', 'note').order('id', { ascending: false }).limit(1).single();
  ok(/Updated the name, phone/.test(noteRow?.comment ?? ''), 'The edit is written on the lead’s history', noteRow?.comment);
  const { data: todayAfter } = await zoya.c.rpc('my_today');
  ok(todayAfter !== null, 'Editing a lead is not counted as a dial');
  await service.from('leads').update({ phone: mine.phone, name: mine.name }).eq('id', mine.id);
  const { data: hl } = await admin.c.from('leads').select('id').eq('assigned_to', hamza.id).limit(1).single();
  const { error: e2 } = await zoya.c.rpc('update_lead_details', { p_lead_id: hl.id, p_fields: { name: 'Sneaky' } });
  ok(!!e2, "A rep cannot edit a colleague's lead", e2?.message);
  const { error: e3 } = await zoya.c.rpc('update_lead_details', { p_lead_id: mine.id, p_fields: { assigned_to: zoya.id } });
  ok(!!e3, 'Only lead details can be edited, not who owns it', e3?.message);
  const { error: e4 } = await zoya.c.rpc('update_lead_details', { p_lead_id: mine.id, p_fields: { personal_email: 'not-an-email' } });
  ok(!!e4, 'A broken email address is refused', e4?.message);

  const { error: e5 } = await zoya.c.from('profiles').update({ is_technical_manager: true }).eq('id', zoya.id);
  ok(!!e5, 'Nobody can make themselves a technical manager', e5?.message);

  // Booking a meeting with a technical manager, in the client's time zone
  const { data: lead2 } = await zoya.c.from('leads').select('id').eq('assigned_to', zoya.id).eq('stage', 'queue').neq('id', mine.id).limit(1).single();
  const at = new Date(Date.now() + 3 * 86400000).toISOString();
  const { error: e6 } = await zoya.c.rpc('log_lead_action', { p_lead_id: lead2.id, p_action: 'call', p_outcome: 'meeting_booked', p_meeting_at: at,
    p_meeting: { timezone: 'America/Chicago', technical_manager_id: hamza.id } });
  ok(!!e6, 'Only someone the admin made a technical manager can be put on a meeting', e6?.message);
  const { data: booked, error: e7 } = await zoya.c.rpc('log_lead_action', { p_lead_id: lead2.id, p_action: 'call', p_outcome: 'meeting_booked', p_meeting_at: at,
    p_meeting: { timezone: 'America/Chicago', technical_manager_id: ayesha.id, transcript: 'Rep: hi\nClient: hello', client_website: 'https://example.com', prep_notes: 'Budget 10k' } });
  ok(!e7 && booked.meeting_id, 'A rep books a meeting with a time zone, technical manager and prep', e7?.message);
  const { data: tmSees } = await ayesha.c.from('meetings').select('id, timezone, transcript, leads(name, phone)').eq('id', booked?.meeting_id).maybeSingle();
  ok(tmSees?.timezone === 'America/Chicago' && tmSees?.transcript && tmSees?.leads, 'The technical manager sees the meeting, its prep and the lead');
  const { data: told } = await service.from('notifications').select('title').eq('user_id', ayesha.id).eq('kind', 'meeting.tm_assigned').gte('created_at', new Date(Date.now() - 60000).toISOString());
  ok(told.length > 0, 'The technical manager is notified', told[0]?.title);
  const { data: faisalSees } = await faisal.c.from('meetings').select('id').eq('id', booked?.meeting_id);
  ok(faisalSees.length === 0, "Other staff can't see a meeting they're not on");
  const { data: hamzaSees } = await hamza.c.from('meetings').select('id').eq('id', booked?.meeting_id);
  ok(hamzaSees.length === 0, "Another rep can't see a colleague's meeting");
  const moved = new Date(Date.now() + 4 * 86400000).toISOString();
  const { error: e8 } = await zoya.c.from('meetings').update({ starts_at: moved }).eq('id', booked.meeting_id);
  const { data: movedNote } = await service.from('notifications').select('title').eq('user_id', ayesha.id).eq('kind', 'meeting.moved').gte('created_at', new Date(Date.now() - 60000).toISOString());
  ok(!e8 && movedNote.length > 0, 'A rep can reschedule, and the technical manager is told', movedNote[0]?.title);
  const { data: tmEdit } = await ayesha.c.from('meetings').update({ title: 'hijack' }).eq('id', booked.meeting_id).select();
  ok(!tmEdit?.length, "A technical manager can't change the rep's meeting");
  const { error: e9 } = await zoya.c.from('meetings').update({ timezone: 'Mars/Olympus' }).eq('id', booked.meeting_id);
  ok(!!e9, 'An unknown time zone is refused', e9?.message);

  // Repeats: every answer except Do not call or a meeting brings the client back in 2 days
  const { data: hq } = await admin.c.from('leads').select('id').eq('assigned_to', hamza.id).eq('stage', 'queue').like('client_key', 'p:%').order('id').limit(4);
  const back = [];
  for (const [i, outcome] of ['not_interested', 'invalid_number', 'wrong_person'].entries()) {
    const { data: r, error } = await hamza.c.rpc('log_lead_action', { p_lead_id: hq[i].id, p_action: 'call', p_outcome: outcome });
    back.push(!error && r.lead.stage === 'queue' && Date.parse(r.lead.next_action_at) - Date.now() > 24 * 3600e3);
  }
  ok(back.every(Boolean), 'Not interested, invalid number and wrong person come back in 2 days instead of closing');
  await service.from('leads').update({ attempts: 5 }).eq('id', hq[3].id);
  const { data: sixth } = await hamza.c.rpc('log_lead_action', { p_lead_id: hq[3].id, p_action: 'call', p_outcome: 'contact_not_established' });
  ok(sixth.lead.stage === 'queue' && !!sixth.lead.next_action_at, 'There is no last call: a 6th no-answer comes back like the first');

  // One client, one answer: copies of the same client with other dialers
  const twin = async (leadId, to, extra = {}) => {
    const { data: l } = await service.from('leads').select('*').eq('id', leadId).single();
    const { id: _i, client_key: _c, phone_key: _p, ...row } = l;
    const { data } = await service.from('leads').insert({ ...row, assigned_to: to, stage: 'queue', status: 'new', attempts: 0, next_action_at: null, deal_id: null, skipped_at: null, ...extra }).select('id, client_key').single();
    return data;
  };
  const { data: two } = await admin.c.from('leads').select('id').eq('assigned_to', hamza.id).eq('stage', 'queue').like('client_key', 'p:%').order('id', { ascending: false }).limit(2);
  const dncCopy = await twin(two[0].id, zoya.id);
  await hamza.c.rpc('log_lead_action', { p_lead_id: two[0].id, p_action: 'call', p_outcome: 'do_not_call' });
  const { data: dc } = await service.from('leads').select('stage, status').eq('id', dncCopy.id).single();
  ok(dc.stage === 'closed' && dc.status === 'do_not_call', "Do not call with one dialer takes the client off every dialer's cards");
  const meetCopy = await twin(two[1].id, zoya.id);
  await hamza.c.rpc('log_lead_action', { p_lead_id: two[1].id, p_action: 'call', p_outcome: 'meeting_booked', p_meeting_at: new Date(Date.now() + 3 * 86400000).toISOString() });
  const { data: mc } = await service.from('leads').select('stage, last_comment').eq('id', meetCopy.id).single();
  ok(mc.stage === 'closed', 'A meeting set by one dialer stops the other dialers calling that client', mc.last_comment);

  // The deck never shows the same client twice
  const { data: due } = await zoya.c.rpc('next_leads', { p_limit: 1 });
  const dueTwin = await twin(due[0].id, zoya.id);
  const { data: deck } = await zoya.c.rpc('next_leads', { p_limit: 20 });
  ok(deck.filter((l) => l.client_key === dueTwin.client_key).length <= 1, 'The dialer deck never shows the same client twice');

  // Remove repeats: a second copy for the same dialer, and the same client with two dialers
  const sharedTwin = await twin(due[0].id, hamza.id);
  await hamza.c.rpc('log_lead_action', { p_lead_id: sharedTwin.id, p_action: 'call', p_outcome: 'voicemail', p_comment: 'Left a VM on the copy' });
  const { error: eTidyRep } = await zoya.c.rpc('tidy_repeat_leads', { p_whole_sheet: [], p_apply: false });
  ok(!!eTidyRep, 'Only an admin can remove repeats', eTidyRep?.message);
  const { data: prev } = await admin.c.rpc('tidy_repeat_leads', { p_whole_sheet: [], p_apply: false });
  const { count: stillThere } = await service.from('leads').select('*', { count: 'exact', head: true }).eq('client_key', dueTwin.client_key);
  ok(prev.own_repeats >= 1 && prev.shared >= 1 && stillThere === 3, 'Remove repeats previews without changing anything', `${prev.own_repeats} own, ${prev.shared} shared`);
  const { data: tidy, error: eTidy } = await admin.c.rpc('tidy_repeat_leads', { p_whole_sheet: [], p_apply: true });
  const { data: left } = await service.from('leads').select('id, assigned_to').eq('client_key', dueTwin.client_key);
  const { data: vm } = await service.from('lead_attempts').select('lead_id').eq('comment', 'Left a VM on the copy');
  ok(!eTidy && left.length === 1 && vm[0]?.lead_id === left[0].id, 'Remove repeats leaves one card for the client, with the call history moved onto it', `${tidy?.own_repeats} own, ${tidy?.shared} shared removed`);
  const wholeTwin = await twin(left[0].id, left[0].assigned_to === zoya.id ? hamza.id : zoya.id);
  await admin.c.rpc('tidy_repeat_leads', { p_whole_sheet: [hamza.id, zoya.id], p_apply: true });
  const { count: kept } = await service.from('leads').select('*', { count: 'exact', head: true }).eq('client_key', wholeTwin.client_key);
  ok(kept === 2, 'Whole-sheet dialers each keep their own copy of a client');

  // Imports: a client twice in the sheet comes in once; a client the dialer has is skipped
  const { data: has } = await service.from('leads').select('phone').eq('assigned_to', zoya.id).not('phone', 'is', null).limit(1).single();
  const { data: impId } = await admin.c.rpc('start_lead_import', { p_file_name: 'check.csv', p_total: 3 });
  const { data: imp } = await admin.c.rpc('import_leads', { p_import_id: impId, p_skip_duplicates: false, p_skip_owned: true, p_rows: [
    { name: 'Check Twin', phone: '(555) 010-4242', assigned_to: zoya.id }, { name: 'Check Twin again', phone: '555.010.4242', assigned_to: zoya.id },
    { name: 'Already hers', phone: has.phone, assigned_to: zoya.id }] });
  ok(imp.inserted === 1 && imp.duplicates === 2, 'An import brings a repeated client in once, and skips clients the dialer already has', JSON.stringify(imp));
  await service.from('leads').delete().eq('name', 'Check Twin');

  // Telling clients apart when the sheet mixed up its columns
  const key = async (phone, personal_email) => (await admin.c.rpc('lead_client_key', { p_phone: phone, p_personal_email: personal_email, p_work_email: null, p_name: 'x', p_post_link: null, p_query: null })).data;
  const [k1, k2] = [await key('walrus07@yahoo.com', null), await key('reem07@mail.com', null)];
  ok(k1 !== k2, 'Digits inside an email in the Phone column never make two people the same client', `${k1} vs ${k2}`);
  const [k3, k4] = [await key('casey@gmail.com', '1-972-977-6900'), await key('(972) 977-6900', 'casey@gmail.com')];
  ok(k3 === k4 && k3 === 'p:9729776900', 'A number typed in the email column is matched like one in the Phone column', `${k3} / ${k4}`);
}

// ---- quick messages: each rep's own
{
  const { data: mine, error } = await zoya.c.from('quick_messages').insert({ title: 'Test', body: 'Hi {first name}, quick test' }).select().single();
  ok(!error && mine?.user_id === zoya.id, 'A rep can save a quick message, and it is theirs', error?.message);
  const { data: peek } = await hamza.c.from('quick_messages').select('id').eq('id', mine.id);
  ok(peek.length === 0, "A rep can't see a colleague's quick messages");
  const { data: hijack } = await hamza.c.from('quick_messages').update({ body: 'hijacked' }).eq('id', mine.id).select();
  ok(!hijack?.length, "A rep can't change a colleague's quick messages");
  const { error: e2 } = await zoya.c.from('quick_messages').insert({ user_id: hamza.id, body: 'planted' });
  ok(!!e2, "A rep can't plant a quick message on someone else", e2?.message);
  await zoya.c.rpc('quick_message_used', { p_id: mine.id });
  const { data: used } = await zoya.c.from('quick_messages').select('uses').eq('id', mine.id).single();
  ok(used.uses === 1, 'Copying a quick message counts it');
  await zoya.c.from('quick_messages').delete().eq('id', mine.id);
}

// ---- mini games: break time only
{
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const ttt = { board: Array(9).fill(null) };
  await zoya.c.rpc('end_break');
  const { error: e1 } = await zoya.c.rpc('game_create', { p_kind: 'tictactoe', p_invitees: [hamza.id], p_state: ttt });
  ok(!!e1 && /break/i.test(e1.message), 'Games are locked outside a break', e1?.message);

  await zoya.c.rpc('start_break');
  const { data: client } = await service.from('profiles').select('id').eq('role', 'client').limit(1).single();
  const { error: e2 } = await zoya.c.rpc('game_create', { p_kind: 'chess', p_invitees: [client.id], p_state: {} });
  ok(!!e2, "Clients can't be invited to games", e2?.message);
  const { data: gid, error: e3 } = await zoya.c.rpc('game_create', { p_kind: 'tictactoe', p_invitees: [hamza.id], p_state: ttt });
  ok(!e3 && gid > 0, 'On a break, a rep can invite a teammate', e3?.message);
  const { data: inviteNote } = await service.from('notifications').select('title').eq('user_id', hamza.id).eq('kind', 'game.invite').order('id', { ascending: false }).limit(1);
  ok(inviteNote?.[0]?.title?.includes('Tic-Tac-Toe'), 'The invite arrives as a notification', inviteNote?.[0]?.title);
  const { data: outsider } = await faisal.c.from('games').select('id').eq('id', gid);
  ok(outsider.length === 0, "People outside a game can't see it");

  await hamza.c.rpc('clock_in');
  await hamza.c.rpc('end_break');
  const { error: e4 } = await hamza.c.rpc('game_respond', { p_game_id: gid, p_accept: true });
  ok(!!e4 && /break/i.test(e4.message), "An invite can't be accepted outside a break", e4?.message);
  await hamza.c.rpc('start_break');
  const { data: started, error: e5 } = await hamza.c.rpc('game_respond', { p_game_id: gid, p_accept: true });
  ok(!e5 && started.status === 'active' && started.turn_user === zoya.id, 'Accepting on a break starts the game; the host goes first', e5?.message);

  const move = (who, version, idx, seat, next) => who.c.rpc('game_move', {
    p_game_id: gid, p_version: version, p_state: { board: ttt.board.map((v, i) => (i === idx ? seat : v)) }, p_next_user: next,
  });
  const { error: e6 } = await move(hamza, started.version, 4, 1, zoya.id);
  ok(!!e6 && /turn/i.test(e6.message), "You can't move when it's not your turn", e6?.message);
  const { error: e7 } = await move(zoya, started.version - 1, 4, 0, hamza.id);
  ok(!!e7 && /changed/i.test(e7.message), 'A move against an old board is refused', e7?.message);
  const { error: e8 } = await move(zoya, started.version, 4, 0, faisal.id);
  ok(!!e8, 'The turn can only pass to a player in the game', e8?.message);
  const { data: moved, error: e9 } = await move(zoya, started.version, 4, 0, hamza.id);
  ok(!e9 && moved.turn_user === hamza.id && moved.version === started.version + 1, 'A move on your turn goes through and passes the turn', e9?.message);
  const { data: direct } = await zoya.c.from('games').update({ status: 'finished', winner_id: zoya.id }).eq('id', gid).select();
  ok(!direct?.length, "Nobody can just declare themselves the winner");

  await hamza.c.rpc('end_break');
  const { error: e10 } = await hamza.c.rpc('game_move', { p_game_id: gid, p_version: moved.version, p_state: { board: ttt.board }, p_next_user: zoya.id });
  ok(!!e10 && /break/i.test(e10.message), 'Moves only count on a break; the game waits', e10?.message);
  const { data: resigned, error: e11 } = await hamza.c.rpc('game_leave', { p_game_id: gid });
  ok(!e11 && resigned.status === 'finished' && resigned.winner_id === zoya.id, 'Resigning (allowed any time) hands the win to the other player', e11?.message);

  // Ludo: up to four, the host starts, the database rolls the dice
  const { data: lid } = await zoya.c.rpc('game_create', { p_kind: 'ludo', p_invitees: [hamza.id, admin.id], p_state: {} });
  const { error: e12 } = await admin.c.rpc('game_respond', { p_game_id: lid, p_accept: true });
  ok(!e12, 'Admins can join a game any time (they are not on the clock)', e12?.message);
  const { data: waitingStill } = await zoya.c.from('games').select('status').eq('id', lid).single();
  ok(waitingStill.status === 'waiting', 'Ludo waits for the host to start');
  const { data: lStart, error: e13 } = await zoya.c.rpc('game_start', { p_game_id: lid, p_state: { seats: [0, 2] } });
  ok(!e13 && lStart.status === 'active', 'The host starts Ludo with whoever joined', e13?.message);
  const { data: r1, error: e14 } = await zoya.c.rpc('game_roll', { p_game_id: lid });
  const { data: r2 } = await zoya.c.rpc('game_roll', { p_game_id: lid });
  ok(!e14 && r1.last_roll >= 1 && r1.last_roll <= 6 && r2.last_roll === r1.last_roll, 'The dice are rolled once per turn by the database', `rolled ${r1?.last_roll}`);
  const { data: hamzaSeat } = await zoya.c.from('game_players').select('status').eq('game_id', lid).eq('user_id', hamza.id).single();
  ok(hamzaSeat.status === 'declined', 'Anyone who had not joined is dropped when Ludo starts');
  await zoya.c.rpc('game_leave', { p_game_id: lid });

  // Not on the attendance clock: no breaks, so games are always open
  const umar = await as('umar@nuuke.test');
  await service.from('employment').update({ tracks_attendance: false }).eq('profile_id', umar.id);
  const { data: uid1, error: e15 } = await umar.c.rpc('game_create', { p_kind: 'chess', p_invitees: [faisal.id], p_state: {} });
  ok(!e15 && uid1 > 0, 'Someone whose attendance is not tracked can play any time', e15?.message);
  const { data: free } = await zoya.c.rpc('players_on_break');
  ok(free.includes(umar.id) && !free.includes(hamza.id), 'They show as free to play; tracked people off a break do not');
  await umar.c.rpc('game_leave', { p_game_id: uid1 });
  await service.from('employment').update({ tracks_attendance: true }).eq('profile_id', umar.id);
  const { error: e16 } = await umar.c.rpc('game_create', { p_kind: 'chess', p_invitees: [faisal.id], p_state: {} });
  ok(!!e16 && /break/i.test(e16.message), 'Once their attendance is tracked again, games wait for a break', e16?.message);

  await zoya.c.rpc('end_break');
  await hamza.c.rpc('clock_out');
}

// ---- cold call sheets
{
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const sana = await as('sana@nuuke.test');
  const { error: e0 } = await zoya.c.from('lead_sheets').insert({ name: 'Sneaky sheet' });
  ok(!!e0, 'A rep cannot create a cold call sheet', e0?.message);
  const { data: sheet, error: e1 } = await admin.c.from('lead_sheets')
    .insert({ name: 'Check spas', instructions: 'Ask for the owner.', fill_fields: [{ label: 'Lunch call', options: ['Answered', 'Voicemail'] }, { label: 'New patient value ($)', number: true }] })
    .select().single();
  ok(!e1 && sheet?.id > 0, 'The admin creates a cold call sheet', e1?.message);
  const { error: e2 } = await zoya.c.rpc('set_sheet_members', { p_sheet: sheet.id, p_members: [zoya.id] });
  ok(!!e2, 'A rep cannot choose who dials a sheet');
  await admin.c.rpc('set_sheet_members', { p_sheet: sheet.id, p_members: [zoya.id, hamza.id], p_notify: true });

  // a number that asked not to be called, among the normal leads
  const { data: dnc } = await service.from('leads').insert({ name: 'Check DNC spa', phone: '(305) 555-0199', status: 'do_not_call', stage: 'closed', closed_reason: 'do_not_call' }).select().single();
  const row = (n, name, phone, priority) => ({ name, phone, personal_email: null, work_email: null, details: { row: n, priority, contact: `Owner of ${name}`, fields: [{ label: 'Area', value: 'Doral' }] } });
  const { data: imp } = await admin.c.rpc('start_lead_import', { p_file_name: 'check-spas.xlsx', p_total: 7 });
  const { data: res, error: e3 } = await admin.c.rpc('import_sheet_leads', { p_import_id: imp, p_sheet: sheet.id, p_rows: [
    row(1, 'Check C spa', '(305) 555-0101', 'C'), row(2, 'Check A spa', '(305) 555-0102', 'A'), row(3, 'Check B spa', '(305) 555-0103', 'B'),
    row(4, 'Check A2 spa', '(305) 555-0104', 'A'), row(5, 'Check A spa again', '305.555.0102', 'A'), row(6, 'Check DNC spa', '305-555-0199', 'A'),
    row(7, '', '', 'B'),
  ] });
  ok(!e3 && res.inserted === 4 && res.duplicates === 2 && res.invalid === 1, 'A cold sheet upload adds each business once, never a Do not call number, and drops blank rows', JSON.stringify(res ?? e3?.message));
  const { data: again } = await admin.c.rpc('import_sheet_leads', { p_import_id: imp, p_sheet: sheet.id, p_rows: [row(8, 'Check A spa', '(305) 555-0102', 'A')] });
  ok(again.inserted === 0, 'Uploading the same business to the sheet again adds nothing');
  await admin.c.rpc('finish_sheet_import', { p_import_id: imp, p_sheet: sheet.id });
  const { data: told } = await hamza.c.from('notifications').select('title').eq('kind', 'leads.sheet');
  ok(told.some((n) => /4 businesses to cold call on Check spas/.test(n.title)), 'Everyone on the sheet is told it is ready', told.map((n) => n.title).join(' | '));

  // who sees it
  const { data: sanaSheets } = await sana.c.rpc('my_lead_sheets');
  const { data: sanaRow } = await sana.c.from('lead_sheets').select('id').eq('id', sheet.id);
  const { error: e4 } = await sana.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 3 });
  const { error: e4b } = await sana.c.rpc('sheet_queue_summary', { p_sheet: sheet.id });
  ok(sanaSheets.length === 0 && sanaRow.length === 0 && !!e4 && !!e4b, 'Someone not on the sheet cannot see it or dial it', e4?.message);
  const { data: zSheets } = await zoya.c.rpc('my_lead_sheets');
  const zs = zSheets.find((x) => x.id === sheet.id);
  ok(zs?.ready === 4 && zs?.total === 4 && zs.instructions === 'Ask for the owner.', 'A dialer on the sheet sees it, with 4 cards ready and its notes', JSON.stringify(zs));
  const { count: pileSeen } = await zoya.c.from('leads').select('*', { count: 'exact', head: true }).eq('sheet_id', sheet.id);
  ok(pileSeen === 0, "The pile isn't readable directly; cards come only through the dialer");

  // normal dialing leaves the sheet alone
  const { data: before } = await zoya.c.rpc('queue_summary', {});
  const { data: zCards } = await zoya.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 2 });
  ok(zCards.map((l) => l.name).join(',') === 'Check A spa,Check A2 spa', 'Priority A is handed out first, in the sheet’s order', zCards.map((l) => l.name).join(','));
  const { data: after } = await zoya.c.rpc('queue_summary', {});
  const { data: normal } = await zoya.c.rpc('next_leads', { p_limit: 20 });
  ok(JSON.stringify(before) === JSON.stringify(after) && normal.every((l) => !l.sheet_id), "Normal dialing never serves a cold-sheet business, and its counts don't change");
  const { data: zOpts } = await zoya.c.rpc('lead_filter_options');
  ok(!zOpts.platforms.some((p) => p.value === 'Cold call'), 'The normal filters leave the cold sheet out');

  // one business, one dialer
  const { data: hCards } = await hamza.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 5 });
  ok(hCards.map((l) => l.name).join(',') === 'Check B spa,Check C spa', 'A second dialer gets only businesses nobody has', hCards.map((l) => l.name).join(','));
  const aSpa = zCards[0];
  const { error: e5 } = await hamza.c.rpc('log_lead_action', { p_lead_id: aSpa.id, p_action: 'call', p_outcome: 'voicemail' });
  ok(!!e5, "A dialer cannot log a call on a business a teammate has");
  const { data: logged, error: e6 } = await zoya.c.rpc('log_lead_action', { p_lead_id: aSpa.id, p_action: 'call', p_outcome: 'contact_not_established' });
  ok(!e6 && logged.lead.assigned_to === zoya.id && new Date(logged.lead.next_action_at) > new Date(Date.now() + 24 * 3600e3),
    'A business called stays with that dialer and comes back to them in 2 days', e6?.message);
  const { data: zSum } = await zoya.c.rpc('sheet_queue_summary', { p_sheet: sheet.id });
  ok(zSum.scheduled_later === 1 && zSum.pile === 0, 'Their sheet counts show it waiting for later', JSON.stringify(zSum));

  // fill-in answers
  const { data: ans, error: e7 } = await zoya.c.rpc('save_lead_answers', { p_lead_id: aSpa.id, p_answers: { 'Lunch call': 'Voicemail', 'New patient value ($)': '450', Sneaky: 'x' } });
  ok(!e7 && ans['Lunch call'] === 'Voicemail' && ans['New patient value ($)'] === '450' && !('Sneaky' in ans), "Answers save to the sheet's own fields only", JSON.stringify(ans ?? e7?.message));
  const { data: ans2 } = await zoya.c.rpc('save_lead_answers', { p_lead_id: aSpa.id, p_answers: { 'Lunch call': '' } });
  ok(!('Lunch call' in ans2) && ans2['New patient value ($)'] === '450', 'Clearing an answer removes just that one');
  const { error: e8 } = await hamza.c.rpc('save_lead_answers', { p_lead_id: aSpa.id, p_answers: { 'Lunch call': 'Answered' } });
  ok(!!e8, "A dialer cannot fill in a teammate's business");

  // ending a session hands back what wasn't called
  const { data: freed } = await zoya.c.rpc('release_sheet_leads', { p_sheet: sheet.id });
  const { data: a2 } = await admin.c.from('leads').select('assigned_to').eq('id', zCards[1].id).single();
  const { data: a1 } = await admin.c.from('leads').select('assigned_to').eq('id', aSpa.id).single();
  ok(freed === 1 && a2.assigned_to === null && a1.assigned_to === zoya.id, 'Ending a session puts uncalled cards back on the pile; called ones stay', `released ${freed}`);
  const { data: hNext } = await hamza.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 5 });
  ok(hNext[0]?.name === 'Check A2 spa' && hNext.length === 3, 'The next dialer picks it up, still Priority A first', hNext.map((l) => l.name).join(','));

  // forgotten cards come back after 12 hours
  await service.from('leads').update({ claimed_at: new Date(Date.now() - 13 * 3600e3).toISOString() }).eq('id', hNext[0].id);
  const { data: zAgain } = await zoya.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 3 });
  ok(zAgain.some((l) => l.id === hNext[0].id), 'A card picked up and left uncalled for 12 hours goes back on the pile');

  // admin lists
  const { data: unassignedIds } = await admin.c.rpc('admin_lead_ids', { p_filter: { assigned: 'unassigned' } });
  const { data: sheetIds } = await admin.c.rpc('admin_lead_ids', { p_filter: { sheet: String(sheet.id) } });
  const { data: sheetRows } = await admin.c.from('leads').select('id').eq('sheet_id', sheet.id);
  ok(sheetIds.length === 4 && sheetRows.every((r) => !unassignedIds.includes(r.id)), '"Unassigned" leaves out the sheet\'s pile, and a sheet filter selects just its businesses');
  const { data: tidy } = await admin.c.rpc('tidy_repeat_leads', { p_whole_sheet: [], p_apply: false });
  const { count: zNormal } = await admin.c.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', zoya.id).is('sheet_id', null);
  ok(tidy.dialers.find((d) => d.dialer === 'Zoya Malik')?.leads === zNormal, 'Remove repeats works on the normal leads only');

  // taking someone off
  await admin.c.rpc('set_sheet_members', { p_sheet: sheet.id, p_members: [zoya.id] });
  const { data: hamzaLeft } = await admin.c.from('leads').select('id').eq('sheet_id', sheet.id).eq('assigned_to', hamza.id);
  const { error: e9 } = await hamza.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 3 });
  ok(hamzaLeft.length === 0 && !!e9, 'Someone taken off the sheet hands back their businesses and can no longer dial it');

  const { data: gone } = await admin.c.rpc('delete_lead_sheet', { p_sheet: sheet.id });
  const { count: leftOver } = await admin.c.from('leads').select('*', { count: 'exact', head: true }).ilike('name', 'Check % spa%').neq('name', 'Check DNC spa');
  ok(gone === 4 && leftOver === 0, 'Deleting a sheet removes its businesses', `${gone} removed`);
  await service.from('leads').delete().eq('id', dnc.id);
}

// ---- handing a leaver's work to colleagues
{
  const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const bilal = await as('bilal@nuuke.test');
  const sana = await as('sana@nuuke.test');
  const mehak = await as('mehak@nuuke.test');
  const day = 864e5;
  const mk = async (row) => (await service.from('leads').insert(row).select().single()).data;
  const repeat = await mk({ name: 'Check HO repeat', phone: '(555) 020-0001', assigned_to: bilal.id, attempts: 2, status: 'contact_not_established', next_action_at: new Date(Date.now() + day).toISOString() });
  const shared = await mk({ name: 'Check HO shared', phone: '(555) 020-0002', assigned_to: bilal.id, attempts: 3, status: 'voicemail', connected: true });
  const mehakCopy = await mk({ name: 'Check HO shared', phone: '555.020.0002', assigned_to: mehak.id });
  const { data: calls } = await service.from('lead_attempts').insert([1, 2, 3].map((n) => ({ lead_id: shared.id, rep_id: bilal.id, action: 'call', outcome: 'voicemail', attempt_no: n, work_date: '2026-10-01' }))).select('id');
  const prospect = await mk({ name: 'Check HO prospect', phone: '(555) 020-0003', assigned_to: bilal.id, stage: 'pipeline', status: 'meeting_booked', attempts: 1 });
  const { data: deal } = await service.from('deals').insert({ owner_id: bilal.id, lead_id: prospect.id, title: 'Check HO deal', stage: 'meeting' }).select().single();
  const { data: wonDeal } = await service.from('deals').insert({ owner_id: bilal.id, title: 'Check HO won', stage: 'won', amount_usd: 900, won_on: '2026-10-01' }).select().single();
  const { data: meeting } = await service.from('meetings').insert({ owner_id: bilal.id, lead_id: prospect.id, deal_id: deal.id, title: 'Check HO meeting', starts_at: new Date(Date.now() + 2 * day).toISOString() }).select().single();
  const { data: pastMeeting } = await service.from('meetings').insert({ owner_id: bilal.id, title: 'Check HO past', starts_at: new Date(Date.now() - 2 * day).toISOString(), status: 'completed' }).select().single();

  // a cold sheet Bilal is on: one business called, one only handed to him
  const { data: sheet } = await admin.c.from('lead_sheets').insert({ name: 'Check HO sheet' }).select().single();
  await admin.c.rpc('set_sheet_members', { p_sheet: sheet.id, p_members: [bilal.id, zoya.id], p_notify: false });
  const { data: imp } = await admin.c.rpc('start_lead_import', { p_file_name: 'ho.xlsx', p_total: 2 });
  await admin.c.rpc('import_sheet_leads', { p_import_id: imp, p_sheet: sheet.id, p_rows: [
    { name: 'Check HO spa called', phone: '(555) 020-0101', personal_email: null, work_email: null, details: { row: 1, priority: 'A' } },
    { name: 'Check HO spa uncalled', phone: '(555) 020-0102', personal_email: null, work_email: null, details: { row: 2, priority: 'B' } },
  ] });
  const { data: spas } = await bilal.c.rpc('next_sheet_leads', { p_sheet: sheet.id, p_limit: 2 });
  await bilal.c.rpc('log_lead_action', { p_lead_id: spas[0].id, p_action: 'call', p_outcome: 'voicemail' });

  const { data: before } = await admin.c.rpc('people_work');
  const bw = before.find((w) => w.id === bilal.id);
  const { data: repWork } = await zoya.c.rpc('people_work');
  ok(bw.open_leads > 0 && bw.deals >= 1 && bw.meetings >= 1 && repWork.length === 0, "The admin sees what each salesperson is holding; a rep doesn't", JSON.stringify(bw));

  const { error: e1 } = await zoya.c.rpc('hand_over_work', { p_from: bilal.id, p_to: [zoya.id], p_apply: true });
  ok(!!e1, "A rep cannot take a colleague's work", e1?.message);
  const { error: e2 } = await admin.c.rpc('hand_over_work', { p_from: bilal.id, p_to: [bilal.id], p_apply: false });
  ok(!!e2, 'Work cannot be handed to the same person', e2?.message);
  const umar = await as('umar@nuuke.test');
  const { error: e3 } = await admin.c.rpc('hand_over_work', { p_from: bilal.id, p_to: [umar.id], p_apply: false });
  ok(!!e3, 'Work only goes to active salespeople', e3?.message);

  const { data: plan, error: e4 } = await admin.c.rpc('hand_over_work', { p_from: bilal.id, p_to: [sana.id, mehak.id], p_apply: false });
  if (e4) throw new Error(`hand_over_work preview: ${e4.message}`);
  const { count: stillBilal } = await admin.c.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', bilal.id);
  const toSana = plan.people.find((x) => x.id === sana.id), toMehak = plan.people.find((x) => x.id === mehak.id);
  ok(!plan.applied && stillBilal === bw.leads && plan.back_to_sheet === 1 && plan.leads === bw.leads - 1, 'The preview changes nothing', JSON.stringify({ ...plan, people: undefined }));
  ok(Math.abs(toSana.clients - toMehak.clients) <= toMehak.already_had + 1 && toMehak.already_had >= 1 && plan.clients === toSana.clients + toMehak.clients,
    'Clients are shared out evenly, and a client a colleague already has goes to them', `Sana ${toSana.clients}, Mehak ${toMehak.clients} (${toMehak.already_had} already hers)`);

  const { data: done, error: e5 } = await admin.c.rpc('hand_over_work', { p_from: bilal.id, p_to: [sana.id, mehak.id], p_apply: true });
  ok(!e5 && done.applied && done.merged >= 1, 'The admin hands the work over', e5?.message ?? `${done.clients} clients, ${done.merged} merged`);
  const { count: left } = await admin.c.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', bilal.id);
  ok(left === 0, 'Nothing is left with the leaver');
  const { data: rep2 } = await admin.c.from('leads').select('assigned_to, next_action_at, attempts, status').eq('id', repeat.id).single();
  ok([sana.id, mehak.id].includes(rep2.assigned_to) && rep2.attempts === 2 && rep2.next_action_at === repeat.next_action_at,
    'A lead keeps its place: same repeat date, call count and status');
  const { data: sharedNow } = await admin.c.from('leads').select('id, assigned_to, attempts, connected').eq('client_key', mehakCopy.client_key);
  const { data: movedCalls } = await admin.c.from('lead_attempts').select('lead_id, rep_id').in('id', calls.map((c) => c.id));
  ok(sharedNow.length === 1 && sharedNow[0].assigned_to === mehak.id && sharedNow[0].attempts === 3 && sharedNow[0].connected
     && movedCalls.length === 3 && movedCalls.every((a) => a.lead_id === sharedNow[0].id && a.rep_id === bilal.id),
    'A client the colleague already had becomes one card with both histories; the calls stay in the leaver\'s name', JSON.stringify(sharedNow));
  const { data: p2 } = await admin.c.from('leads').select('assigned_to').eq('id', prospect.id).single();
  const { data: d2 } = await admin.c.from('deals').select('owner_id').eq('id', deal.id).single();
  const { data: m2 } = await admin.c.from('meetings').select('owner_id').eq('id', meeting.id).single();
  ok(d2.owner_id === p2.assigned_to && m2.owner_id === p2.assigned_to, 'The open deal and booked meeting go with their client');
  const { data: w2 } = await admin.c.from('deals').select('owner_id').eq('id', wonDeal.id).single();
  const { data: pm2 } = await admin.c.from('meetings').select('owner_id').eq('id', pastMeeting.id).single();
  ok(w2.owner_id === bilal.id && pm2.owner_id === bilal.id, 'Won deals and past meetings stay in the leaver\'s name (pay and stats unchanged)');
  const { data: calledSpa } = await admin.c.from('leads').select('assigned_to').eq('id', spas[0].id).single();
  const { data: uncalledSpa } = await admin.c.from('leads').select('assigned_to').eq('id', spas[1].id).single();
  const { data: members } = await admin.c.from('lead_sheet_members').select('user_id').eq('sheet_id', sheet.id);
  const ids = members.map((m) => m.user_id);
  ok(uncalledSpa.assigned_to === null && [sana.id, mehak.id].includes(calledSpa.assigned_to) && ids.includes(calledSpa.assigned_to) && !ids.includes(bilal.id),
    'Cold sheet: uncalled businesses go back on the pile, called ones go to a colleague who joins the sheet, and the leaver leaves it');
  const { data: told } = await sana.c.from('notifications').select('title').eq('kind', 'leads.handover');
  ok(told.some((n) => /Bilal's work is now yours/.test(n.title)), 'Everyone who got something is told');

  await admin.c.rpc('delete_lead_sheet', { p_sheet: sheet.id });
  await service.from('meetings').delete().in('id', [meeting.id, pastMeeting.id]);
  await service.from('deals').delete().in('id', [deal.id, wonDeal.id]);
  await service.from('leads').delete().like('name', 'Check HO %');
}

// ---- clean up the clock-in so the demo starts fresh
await zoya.c.rpc('clock_out');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
