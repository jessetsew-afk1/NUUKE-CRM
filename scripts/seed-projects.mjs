/**
 * Demo projects for the production workspace and the client portal (called by seed.mjs).
 *
 * Everything is done "as" the person who would have done it, so the database's own
 * triggers write the activity feed and the alerts, then the timestamps are moved back
 * to when it would have happened.
 */

const DAY = 86_400_000;

// ------------------------------------------------------------- demo artwork
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function wireframe(title, accent, blocks) {
  const rows = blocks.map((b, i) => {
    const y = 250 + i * 150;
    return `<rect x="32" y="${y}" width="326" height="128" rx="22" fill="#fff" stroke="#e3e1ee"/>
      <rect x="52" y="${y + 22}" width="64" height="64" rx="16" fill="${accent}" opacity=".18"/>
      <rect x="132" y="${y + 28}" width="170" height="14" rx="7" fill="#2b2a35" opacity=".8"/>
      <rect x="132" y="${y + 54}" width="130" height="10" rx="5" fill="#9b98ab"/>
      <text x="132" y="${y + 104}" font-family="Inter,Arial" font-size="13" fill="#8a879b">${esc(b)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1688" viewBox="0 0 390 844">
    <rect width="390" height="844" fill="#f5f4fa"/>
    <rect x="0" y="0" width="390" height="210" fill="${accent}"/>
    <circle cx="330" cy="40" r="90" fill="#fff" opacity=".12"/>
    <rect x="32" y="62" width="44" height="44" rx="14" fill="#fff" opacity=".9"/>
    <text x="32" y="150" font-family="Inter,Arial" font-weight="800" font-size="28" fill="#fff">${esc(title)}</text>
    <text x="32" y="180" font-family="Inter,Arial" font-size="14" fill="#fff" opacity=".85">Wireframe · draft for review</text>
    ${rows}
    <rect x="32" y="${250 + blocks.length * 150 + 10}" width="326" height="56" rx="18" fill="#0b0b10"/>
    <text x="195" y="${250 + blocks.length * 150 + 44}" text-anchor="middle" font-family="Inter,Arial" font-weight="700" font-size="16" fill="#fff">Continue</text>
    <rect x="0" y="780" width="390" height="64" fill="#fff" stroke="#e3e1ee"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${42 + i * 88}" y="800" width="42" height="24" rx="8" fill="${i === 0 ? accent : '#d7d4e3'}"/>`).join('')}
  </svg>`;
}
function creative(headline, sub, from, to) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="1080" height="1080" fill="url(#g)"/>
    <circle cx="820" cy="300" r="260" fill="#fff" opacity=".12"/>
    <circle cx="260" cy="860" r="180" fill="#000" opacity=".08"/>
    <rect x="390" y="330" width="300" height="420" rx="60" fill="#3b2418"/>
    <rect x="420" y="300" width="240" height="70" rx="24" fill="#f4e7d8"/>
    <rect x="430" y="470" width="220" height="140" rx="20" fill="#f4e7d8" opacity=".9"/>
    <text x="540" y="555" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="44" fill="#3b2418">BB</text>
    <text x="80" y="150" font-family="Inter,Arial" font-weight="900" font-size="86" fill="#fff">${esc(headline)}</text>
    <text x="80" y="220" font-family="Inter,Arial" font-size="38" fill="#fff" opacity=".9">${esc(sub)}</text>
    <text x="80" y="1000" font-family="Inter,Arial" font-weight="700" font-size="30" fill="#fff" opacity=".85">@brightbrew</text>
  </svg>`;
}

export async function seedProjects({ db, sql, ids, today, password }) {
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600_000);
  const ahead = (days, hhmm = '15:00') => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.parse(addDays(today, days) + 'T00:00:00Z') + ((h - 5) * 60 + m) * 60_000); // PKT
  };

  // Clean out last run's files.
  const { data: folders } = await db.storage.from('project-files').list('', { limit: 1000 });
  for (const f of folders ?? []) {
    const { data: inside } = await db.storage.from('project-files').list(f.name, { limit: 1000 });
    if (inside?.length) await db.storage.from('project-files').remove(inside.map((x) => `${f.name}/${x.name}`));
  }

  // Client logins -----------------------------------------------------------
  const CLIENTS = [
    { key: 'sarah', email: 'sarah@halcyon.test', full_name: 'Sarah Whitfield', title: 'Halcyon Health',
      avatar: { skin: 's2', eyes: 'happy', brows: 'soft', mouth: 'smile', cheeks: true, hair: 'long', hairColor: 'blonde', hat: 'none', glasses: 'none', outfit: 'blazer', outfitColor: 'sky', accessory: 'pearls', held: 'coffee', pet: 'none', bg: 'sky' } },
    { key: 'leo', email: 'leo@brightbrew.test', full_name: 'Leo Martins', title: 'BrightBrew Coffee',
      avatar: { skin: 's4', eyes: 'dot', brows: 'raised', mouth: 'grin', cheeks: false, hair: 'curly', hairColor: 'black', hat: 'cap', glasses: 'none', outfit: 'tee', outfitColor: 'peach', accessory: 'none', held: 'coffee', pet: 'dog', bg: 'peach' } },
  ];
  for (const c of CLIENTS) {
    const { data, error } = await db.auth.admin.createUser({ email: c.email, password, email_confirm: true, user_metadata: { full_name: c.full_name } });
    if (error) throw new Error(`client ${c.email}: ${error.message}`);
    ids[c.key] = data.user.id;
    const { error: e2 } = await db.from('profiles').insert({ id: data.user.id, email: c.email, full_name: c.full_name, role: 'client', title: c.title, avatar: c.avatar });
    if (e2) throw new Error(`client profile: ${e2.message}`);
  }

  /** Run SQL as a person, at a moment in the past. Feed rows and alerts it causes get that time. */
  async function as(who, when, text, params = []) {
    await sql.query('begin');
    try {
      await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids[who], role: 'authenticated' })]);
      const res = await sql.query(text, params);
      if (when) {
        await sql.query('update public.project_activity set created_at = $1 where created_at = now()', [when]);
        await sql.query('update public.notifications set created_at = $1 where created_at = now()', [when]);
        await sql.query('update public.file_comments set created_at = $1 where created_at = now()', [when]);
        await sql.query('update public.project_files set reviewed_at = $1 where reviewed_at = now()', [when]);
      }
      await sql.query('commit');
      return res.rows;
    } catch (e) {
      await sql.query('rollback');
      throw e;
    }
  }
  const one = async (...a) => (await as(...a))[0];

  async function project(row, members) {
    const p = await one('admin', ago(row.age), `insert into public.projects (name, client_name, service, description, color, status, starts_on, due_on)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [row.name, row.client_name, row.service, row.description, row.color, row.status, addDays(today, -row.age), row.due ? addDays(today, row.due) : null]);
    for (const [k, lead] of members) {
      await as('admin', ago(row.age, -1), 'insert into public.project_members (project_id, profile_id, is_lead) values ($1,$2,$3)', [p.id, ids[k], lead]);
    }
    return p;
  }
  async function sprint(pid, name, goal, from, to, status) {
    return one('admin', ago(-from + 1), `insert into public.sprints (project_id, name, goal, starts_on, ends_on, status, completed_at)
      values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [pid, name, goal, addDays(today, from), addDays(today, to), status, status === 'done' ? ago(-to) : null]);
  }
  /** t: [title, status, who, sprint, dueOffset, priority, labels, doneDaysAgo, createdDaysAgo, hidden] */
  async function tasks(pid, creator, list) {
    let pos = 1;
    for (const [title, status, who, sp, due, priority = 'medium', labels = [], doneAgo = null, made = 20, hidden = false] of list) {
      const first = status === 'backlog' ? 'backlog' : 'todo';
      const t = await one(creator, ago(made), `insert into public.tasks (project_id, sprint_id, title, status, priority, assignee_id, due_on, labels, client_visible, position)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [pid, sp?.id ?? null, title, first, priority, who ? ids[who] : null, due === null ? null : addDays(today, due), labels, !hidden, pos++]);
      await sql.query('update public.tasks set created_at = $2 where id = $1', [t.id, ago(made)]);
      if (status !== first) {
        const when = doneAgo !== null ? ago(doneAgo, 2) : ago(made / 2, 3);
        await as(who ?? creator, when, 'update public.tasks set status = $2 where id = $1', [t.id, status]);
        if (status === 'done') await sql.query('update public.tasks set completed_at = $2 where id = $1', [t.id, when]);
      }
    }
  }
  async function upload(pid, name, svg) {
    const path = `${pid}/${crypto.randomUUID()}-${name}`;
    const { error } = await db.storage.from('project-files').upload(path, new Blob([svg], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' });
    if (error) throw new Error(`upload ${name}: ${error.message}`);
    return { path, size: svg.length };
  }
  async function file(pid, who, when, f) {
    const row = await one(who, when, `insert into public.project_files (project_id, group_id, title, kind, description, storage_path, external_url, mime_type, size_bytes, client_visible, review_status, from_client)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [pid, f.group ?? null, f.title, f.kind, f.description ?? null, f.path ?? null, f.url ?? null, f.path ? 'image/svg+xml' : null, f.size ?? null,
      f.visible ?? true, f.review ?? 'none', f.fromClient ?? false]);
    await sql.query(`update public.project_files set created_at = $2,
      review_requested_at = case when review_status = 'pending' then $2 else review_requested_at end where id = $1`, [row.id, when]);
    return row;
  }
  const comment = (who, when, fileId, body, x = null, y = null) =>
    as(who, when, 'insert into public.file_comments (file_id, author_id, body, pin_x, pin_y, created_at) values ($1,$2,$3,$4,$5,$6)', [fileId, ids[who], body, x, y, when]);
  const message = (pid, who, when, body) =>
    as(who, when, 'insert into public.project_messages (project_id, author_id, body, created_at) values ($1,$2,$3,$4)', [pid, ids[who], body, when]);

  // ====================================================== 1. Halcyon patient app
  const halcyon = await project({
    name: 'Halcyon Patient App', client_name: 'Halcyon Health', service: 'Mobile App Development', color: '#7C5CFF', status: 'active', age: 34, due: 48,
    description: 'iOS and Android app for Halcyon\'s clinics: book appointments, video visits, prescriptions and secure messages with the care team.',
  }, [['faisal', true], ['ayesha', false], ['sarah', false]]);
  const s1 = await sprint(halcyon.id, 'Sprint 1 — Discovery', 'Research, user flows and the design system foundations', -30, -17, 'done');
  const s2 = await sprint(halcyon.id, 'Sprint 2 — Booking flow', 'Wireframes and clickable prototype of booking an appointment', -16, -3, 'done');
  const s3 = await sprint(halcyon.id, 'Sprint 3 — Build the core', 'Sign-in, booking and the home screen working on TestFlight', -2, 11, 'active');
  const s4 = await sprint(halcyon.id, 'Sprint 4 — Video visits', 'Video visits and the waiting room', 12, 25, 'planned');
  await tasks(halcyon.id, 'faisal', [
    ['Stakeholder interviews with 3 clinic managers', 'done', 'ayesha', s1, -26, 'high', ['research'], 26, 32],
    ['Map the patient journey end to end', 'done', 'ayesha', s1, -22, 'medium', ['research'], 22, 32],
    ['Pick the tech stack (React Native + Supabase)', 'done', 'faisal', s1, -20, 'high', ['dev'], 21, 31],
    ['Design system: colours, type, components', 'done', 'ayesha', s1, -18, 'medium', ['design'], 18, 31],
    ['Booking flow wireframes', 'done', 'ayesha', s2, -10, 'high', ['design', 'booking'], 9, 16],
    ['Clickable prototype in Figma', 'done', 'ayesha', s2, -6, 'medium', ['design'], 5, 16],
    ['Set up the repo, CI and TestFlight', 'done', 'faisal', s2, -8, 'medium', ['dev'], 8, 16],
    ['API contract for appointments', 'done', 'faisal', s2, -4, 'medium', ['dev'], 4, 15],
    ['Sign in with email + one-time code', 'done', 'faisal', s3, 1, 'high', ['dev', 'auth'], 1, 3],
    ['Home screen: next appointment card', 'done', 'faisal', s3, 2, 'medium', ['dev'], 0.3, 3],
    ['Book an appointment — pick clinic & time', 'in_progress', 'faisal', s3, 4, 'urgent', ['dev', 'booking'], null, 3],
    ['Home screen visual polish', 'in_progress', 'ayesha', s3, 3, 'medium', ['design'], null, 3],
    ['Appointment confirmation + calendar invite', 'review', 'faisal', s3, 5, 'high', ['dev', 'booking'], null, 3],
    ['Empty states & error screens', 'todo', 'ayesha', s3, 7, 'low', ['design'], null, 2],
    ['Push notification reminders', 'todo', 'faisal', s3, 9, 'medium', ['dev'], null, 2],
    ['Accessibility pass (VoiceOver, text sizes)', 'todo', 'ayesha', s3, 10, 'medium', ['design', 'a11y'], null, 2],
    ['Load testing the booking API', 'todo', 'faisal', s3, 0, 'high', ['dev'], null, 2, true],
    ['Write App Store listing copy', 'todo', null, s4, 20, 'low', ['launch'], null, 1],
    ['Video visit SDK spike', 'backlog', 'faisal', s4, null, 'medium', ['dev', 'video'], null, 1],
    ['Waiting room design', 'backlog', 'ayesha', s4, null, 'medium', ['design', 'video'], null, 1],
    ['Prescription refill request flow', 'backlog', null, null, null, 'low', ['later'], null, 1],
    ['Internal: fix flaky e2e test on CI', 'in_progress', 'faisal', s3, -1, 'medium', ['dev'], null, 2, true],
  ]);
  const hw1 = await upload(halcyon.id, 'booking-wireframe-v1.svg', wireframe('Book a visit', '#7C5CFF', ['Choose a clinic', 'Pick a doctor', 'Pick a time']));
  const hw2 = await upload(halcyon.id, 'booking-wireframe-v2.svg', wireframe('Book a visit', '#7C5CFF', ['Nearest clinics first', 'Doctor + reviews', 'Next free slots', ]));
  const hh = await upload(halcyon.id, 'home-screen.svg', wireframe('Good morning, Sam', '#34D3A0', ['Next appointment · Tue 10:30', 'Messages from your care team']));
  const hs = await upload(halcyon.id, 'sign-in.svg', wireframe('Welcome back', '#5AB8FF', ['Email address', 'One-time code']));
  const v1 = await file(halcyon.id, 'ayesha', ago(9), { title: 'Booking flow — wireframes', kind: 'wireframe', path: hw1.path, size: hw1.size, review: 'pending', description: 'Three steps: clinic, doctor, time.' });
  await as('sarah', ago(8, 20), `select public.review_file($1, 'changes_requested', 'Patients usually care about the nearest clinic first — can we lead with that? And show the next free slot without an extra tap.')`, [v1.id]);
  await comment('sarah', ago(8, 21), v1.id, 'Can the clinic list sort by distance?', 0.5, 0.36);
  await comment('ayesha', ago(8, 18), v1.id, 'Great call — doing it in v2.');
  const v2 = await file(halcyon.id, 'ayesha', ago(1, 3), { title: 'Booking flow — wireframes', kind: 'wireframe', group: v1.id, path: hw2.path, size: hw2.size, review: 'pending', description: 'Nearest clinics first, doctor ratings, and the next free slots right on the card.' });
  await comment('ayesha', ago(1, 2), v2.id, 'Next free slots now show straight on the card ↓', 0.55, 0.62);
  const sign = await file(halcyon.id, 'ayesha', ago(6), { title: 'Sign-in screens', kind: 'design', path: hs.path, size: hs.size, review: 'pending' });
  await as('sarah', ago(5, 22), `select public.review_file($1, 'approved', 'Clean and simple. Love it!')`, [sign.id]);
  await file(halcyon.id, 'ayesha', ago(0, 5), { title: 'Home screen', kind: 'design', path: hh.path, size: hh.size, review: 'pending', description: 'First look at the home screen with the next appointment front and centre.' });
  await file(halcyon.id, 'ayesha', ago(5), { title: 'Booking prototype (Figma)', kind: 'prototype', url: 'https://www.figma.com/proto/demo-halcyon-booking', review: 'none' });
  await file(halcyon.id, 'faisal', ago(4), { title: 'Architecture notes (internal)', kind: 'document', url: 'https://docs.google.com/document/d/demo-architecture/edit', visible: false });
  await as('faisal', ago(2), `insert into public.project_events (project_id, title, kind, starts_at, ends_at, location, client_visible)
    values ($1, 'Sprint 3 demo with Halcyon', 'meeting', $2, $3, 'https://zoom.us/j/555000111', true)`, [halcyon.id, ahead(4, '17:00'), ahead(4, '17:45')]);
  await as('faisal', ago(2), `insert into public.project_events (project_id, title, kind, starts_at, client_visible) values ($1, 'Beta on TestFlight', 'milestone', $2, true)`, [halcyon.id, ahead(11, '12:00')]);
  await as('faisal', ago(2), `insert into public.project_events (project_id, title, kind, starts_at, client_visible) values ($1, 'Internal code freeze', 'deadline', $2, false)`, [halcyon.id, ahead(9, '18:00')]);
  await as('faisal', ago(12), `insert into public.project_events (project_id, title, kind, starts_at, ends_at, location, client_visible)
    values ($1, 'Kickoff for Sprint 2', 'meeting', $2, $3, 'https://zoom.us/j/555000111', true)`, [halcyon.id, ahead(-16, '16:00'), ahead(-16, '16:30')]);
  await message(halcyon.id, 'sarah', ago(3, 4), 'Hi team! Our clinic managers loved the prototype. When can we try it on our phones?');
  await message(halcyon.id, 'faisal', ago(3, 3), 'Thanks Sarah! Sign-in and the home screen are on TestFlight end of this sprint — the beta milestone is on your calendar.');
  await message(halcyon.id, 'sarah', ago(0, 6), 'Perfect. I just saw the new booking wireframes come in, will review tonight 👀');

  // ================================================== 2. BrightBrew launch campaign
  const brew = await project({
    name: 'BrightBrew Launch Campaign', client_name: 'BrightBrew Coffee', service: 'Digital Marketing', color: '#FF9A6B', status: 'active', age: 20, due: 25,
    description: 'Launch of the Cold Brew range: a month of social content, a launch reel and paid ads.',
  }, [['umar', true], ['ayesha', false], ['leo', false]]);
  const b1 = await sprint(brew.id, 'Launch month', 'Teasers, launch day and two weeks of momentum', -6, 21, 'active');
  await tasks(brew.id, 'umar', [
    ['Campaign strategy & content pillars', 'done', 'umar', b1, -4, 'high', ['strategy'], 5, 18],
    ['Moodboard & visual direction', 'done', 'ayesha', b1, -3, 'medium', ['design'], 3, 18],
    ['Shoot list for the launch reel', 'done', 'umar', b1, -1, 'medium', ['video'], 1, 10],
    ['Launch-day creative set (6 posts)', 'in_progress', 'ayesha', b1, 2, 'urgent', ['design'], null, 6],
    ['Write captions for week 1', 'review', 'umar', b1, 1, 'high', ['copy'], null, 6],
    ['Paid ads audiences & budget split', 'todo', 'umar', b1, 5, 'medium', ['ads'], null, 4],
    ['Influencer shortlist', 'todo', 'umar', b1, 8, 'low', ['outreach'], null, 4],
    ['Week 2 creative', 'backlog', 'ayesha', b1, 12, 'medium', ['design'], null, 2],
  ]);
  const c1 = await upload(brew.id, 'launch-post.svg', creative('Cold Brew Season', 'Slow-steeped for 18 hours.', '#FF9A6B', '#B4532A'));
  const c2 = await upload(brew.id, 'teaser.svg', creative('Something cold…', 'is brewing. 05.10', '#2B2A35', '#FF9A6B'));
  const launch = await file(brew.id, 'ayesha', ago(0, 8), { title: 'Launch post — hero creative', kind: 'design', path: c1.path, size: c1.size, review: 'pending', description: 'Main launch-day post. Also cut to 9:16 for stories.' });
  const teaser = await file(brew.id, 'ayesha', ago(4), { title: 'Teaser post', kind: 'design', path: c2.path, size: c2.size, review: 'pending' });
  await as('leo', ago(3, 20), `select public.review_file($1, 'approved', 'Mysterious — love it.')`, [teaser.id]);
  await file(brew.id, 'umar', ago(6), { title: 'Launch reel storyboard', kind: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', review: 'none' });
  const posts = [
    ['Teaser: something cold is brewing', 'instagram', -2, 'posted', teaser.id],
    ['Teaser (TikTok cut)', 'tiktok', -1, 'posted', teaser.id],
    ['LAUNCH: Cold Brew Season is here', 'instagram', 2, 'scheduled', launch.id],
    ['Launch reel', 'tiktok', 2, 'ready', null],
    ['Launch announcement', 'facebook', 2, 'scheduled', launch.id],
    ['Behind the brew: 18 hours', 'instagram', 4, 'drafting', null],
    ['Customer reactions carousel', 'instagram', 7, 'idea', null],
    ['Cold brew recipes thread', 'x', 8, 'drafting', null],
    ['Founder story', 'linkedin', 9, 'idea', null],
    ['Weekend giveaway', 'instagram', 11, 'idea', null],
    ['Newsletter: launch recap', 'email', 14, 'idea', null],
  ];
  for (const [title, platform, d, status, fid] of posts) {
    await as('umar', ago(Math.max(0, 6 + Math.min(0, d))), `insert into public.content_posts (project_id, title, platform, scheduled_at, status, file_id, owner_id, caption, client_visible)
      values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
    [brew.id, title, platform, ahead(d, '19:00'), status, fid, ids.umar, status === 'idea' ? null : 'Slow-steeped for 18 hours. Smooth, bold, and ready when you are. ☕️❄️ #BrightBrew #ColdBrewSeason']);
  }
  await as('umar', ago(3), `insert into public.project_events (project_id, title, kind, starts_at, client_visible) values ($1, 'Launch day 🚀', 'launch', $2, true)`, [brew.id, ahead(2, '19:00')]);
  await as('umar', ago(3), `insert into public.project_events (project_id, title, kind, starts_at, ends_at, location, client_visible)
    values ($1, 'Weekly check-in with Leo', 'meeting', $2, $3, 'https://meet.google.com/demo-brew', true)`, [brew.id, ahead(1, '16:00'), ahead(1, '16:30')]);
  await message(brew.id, 'leo', ago(1, 5), 'The teaser numbers look great! 4k views in a day 🙌');
  await message(brew.id, 'umar', ago(1, 4), 'Amazing! Launch creative is up for your review — once you approve we schedule everything for Saturday.');
  await message(brew.id, 'leo', ago(0, 2), 'Quick one — can we add our new oat milk option to the launch post?');

  // ================================================== 3. Halcyon website (second project for Sarah)
  const site = await project({
    name: 'Halcyon Website Refresh', client_name: 'Halcyon Health', service: 'Web Development', color: '#34D3A0', status: 'planning', age: 5, due: 70,
    description: 'A faster, friendlier website that sends patients straight into the new app.',
  }, [['faisal', false], ['umar', true], ['sarah', false]]);
  await tasks(site.id, 'umar', [
    ['Audit the current site & analytics', 'in_progress', 'umar', null, 3, 'high', ['research'], null, 4],
    ['Sitemap & page list', 'todo', 'umar', null, 6, 'medium', ['planning'], null, 4],
    ['Pick the CMS', 'todo', 'faisal', null, 9, 'medium', ['dev'], null, 3],
    ['SEO keyword research', 'backlog', 'umar', null, null, 'low', ['seo'], null, 2],
  ]);
  await message(site.id, 'sarah', ago(2), 'Excited for this one too! Sending over our brand guidelines today.');

  // ================================================== 4. An internal project (no client)
  const brand = await project({
    name: 'NUUKE Showreel 2026', client_name: null, service: 'Internal', color: '#0B0B10', status: 'active', age: 10, due: 30,
    description: 'Our own portfolio refresh: case studies and a 60-second showreel.',
  }, [['ayesha', true], ['umar', false]]);
  await tasks(brand.id, 'ayesha', [
    ['Pick 6 case studies', 'done', 'ayesha', null, -3, 'medium', [], 3, 9],
    ['Halcyon case study draft', 'todo', 'umar', null, 12, 'medium', ['copy'], null, 5],
    ['Showreel edit', 'backlog', 'ayesha', null, null, 'medium', ['video'], null, 5],
  ]);

  // Everyone has read the older messages; the newest client messages stay unread for the team.
  await sql.query(`insert into public.project_reads (profile_id, project_id, messages_seen_at)
    select pm.profile_id, pm.project_id, now() - interval '1 day' from public.project_members pm
    on conflict do nothing`);

  console.log(`  projects      4 (Halcyon app, BrightBrew, Halcyon web, NUUKE showreel)`);
  return CLIENTS;
}
