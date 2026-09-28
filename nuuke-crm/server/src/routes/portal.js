import express from 'express';
import { rows, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { handler, forbidden, badRequest } from '../lib/errors.js';
import { CLIENT_VISIBLE_TASK_STATUS } from '../domain/options.js';

/**
 * The client-facing surface — the only API a CLIENT login can reach.
 *
 * Every statement below filters on one account id that comes from the signed-in
 * session, never from the request. A client cannot widen the query, because
 * there is no parameter to widen: there are no filters, ids or field selectors
 * in this router's inputs at all.
 *
 * What is deliberately absent: budgets, burn, staff names, capacity, defects,
 * backlog tickets, other accounts, internal notes, and every commercial board.
 */
const router = express.Router();

/** Staff may preview any account's portal; a client only ever gets their own. */
function accountFor(req) {
  if (req.user.role === 'CLIENT') {
    if (!req.user.client_id) throw forbidden('This login is not linked to an account');
    return req.user.client_id;
  }
  const requested = Number(req.query.clientId);
  if (!Number.isInteger(requested) || requested < 1) {
    throw badRequest('Choose an account to preview');
  }
  return requested;
}

router.get(
  '/accounts',
  requireRole('ADMIN', 'MANAGER'),
  handler(async (req, res) => {
    const data = await rows(
      `SELECT id, name, status FROM clients
        WHERE status IN ('Active','Onboarding') ORDER BY name`
    );
    res.json({ data });
  })
);

router.get(
  '/overview',
  handler(async (req, res) => {
    const clientId = accountFor(req);

    const account = await one(
      `SELECT id, name, status, since, region FROM clients WHERE id = $1`, [clientId]
    );
    if (!account) throw forbidden('That account is not available');

    const projects = await rows(
      `SELECT p.id, p.name, p.status, p.start_on, p.end_on,
              COALESCE(ROUND(100.0 * count(t.id) FILTER (WHERE t.status = 'Done')
                       / NULLIF(count(t.id), 0)), 0)::int AS progress
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.client_id = $1
        GROUP BY p.id
        ORDER BY p.start_on NULLS LAST, p.id`,
      [clientId]
    );

    const projectIds = projects.map((p) => p.id);
    const empty = projectIds.length === 0;

    const [sprints, inFlight, milestones, approvals, releases, tickets, invoices] = await Promise.all([
      empty ? [] : rows(
        `SELECT s.id, s.name, s.goal, s.start_on, s.end_on, s.committed_points, s.project_id,
                COALESCE(sum(t.points) FILTER (WHERE t.status = 'Done'), 0)::int AS shipped_points
           FROM sprints s LEFT JOIN tasks t ON t.sprint_id = s.id
          WHERE s.project_id = ANY($1) AND s.status = 'Active'
          GROUP BY s.id ORDER BY s.start_on`,
        [projectIds]
      ),
      empty ? [] : rows(
        `SELECT t.id, t.title, t.status, t.department, t.sprint_id
           FROM tasks t
          WHERE t.project_id = ANY($1)
            AND t.status = ANY($2)
            AND t.sprint_id IN (SELECT id FROM sprints WHERE project_id = ANY($1) AND status = 'Active')
          ORDER BY t.status, t.id`,
        [projectIds, CLIENT_VISIBLE_TASK_STATUS]
      ),
      empty ? [] : rows(
        `SELECT id, name, status, due_on, note, project_id
           FROM milestones
          WHERE project_id = ANY($1) AND client_visible = TRUE
          ORDER BY due_on NULLS LAST`,
        [projectIds]
      ),
      empty ? [] : rows(
        `SELECT id, name, status, sent_on, due_on, note, project_id
           FROM approvals WHERE project_id = ANY($1)
          ORDER BY (status = 'Approved'), due_on NULLS LAST`,
        [projectIds]
      ),
      empty ? [] : rows(
        `SELECT id, name, status, platform, target_on, notes, project_id
           FROM releases WHERE project_id = ANY($1) AND status <> 'Live'
          ORDER BY target_on NULLS LAST`,
        [projectIds]
      ),
      rows(
        `SELECT id, key, subject, status, priority, sla_due_at, opened_on
           FROM tickets
          WHERE client_id = $1 AND status NOT IN ('Resolved','Closed')
          ORDER BY sla_due_at NULLS LAST`,
        [clientId]
      ),
      rows(
        `SELECT id, number, status, amount, issued_on, due_on, project_id
           FROM invoices WHERE client_id = $1 AND status <> 'Draft'
          ORDER BY issued_on DESC NULLS LAST`,
        [clientId]
      ),
    ]);

    res.json({
      data: { account, projects, sprints, inFlight, milestones, approvals, releases, tickets, invoices },
    });
  })
);

/**
 * A client answering an approval. They can accept or ask for changes; they can
 * never mark something approved on a project that is not theirs, and they cannot
 * set any other field.
 */
router.post(
  '/approvals/:id/respond',
  handler(async (req, res) => {
    const clientId = accountFor(req);
    const id = Number(req.params.id);
    const decision = req.body?.decision;

    if (!['Approved', 'Changes requested'].includes(decision)) {
      throw badRequest('Choose whether you are approving this or asking for changes');
    }

    const updated = await one(
      `UPDATE approvals SET status = $1
        WHERE id = $2
          AND project_id IN (SELECT id FROM projects WHERE client_id = $3)
        RETURNING id, name, status, project_id`,
      [decision, id, clientId]
    );
    if (!updated) throw forbidden('That item is not on your account');

    res.json({ data: updated });
  })
);

/** A client raising a support request from the portal. */
router.post(
  '/tickets',
  handler(async (req, res) => {
    const clientId = accountFor(req);
    const subject = String(req.body?.subject ?? '').trim();
    const priority = req.body?.priority ?? 'Medium';

    if (subject.length < 5) throw badRequest('Give the request a subject of at least five characters');
    if (!['Critical', 'High', 'Medium', 'Low'].includes(priority)) throw badRequest('Unknown priority');

    const { next } = await one(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(key, '\\D', '', 'g'), '')::int), 2200) + 1 AS next FROM tickets`
    );

    // SLA clock by priority, matching the support contract.
    const slaHours = { Critical: 4, High: 12, Medium: 24, Low: 72 }[priority];

    const created = await one(
      `INSERT INTO tickets (key, subject, client_id, status, priority, channel, opened_on, sla_due_at)
       VALUES ($1, $2, $3, 'New', $4, 'Portal', CURRENT_DATE, now() + ($5 || ' hours')::interval)
       RETURNING id, key, subject, status, priority, sla_due_at, opened_on`,
      [`SUP-${next}`, subject, clientId, priority, slaHours]
    );

    res.status(201).json({ data: created });
  })
);

export default router;
