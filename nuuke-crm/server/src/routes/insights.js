import express from 'express';
import { rows, one } from '../db.js';
import { handler, forbidden } from '../lib/errors.js';

const router = express.Router();

/** The shared activity feed. Members see it too — it is how a squad keeps up. */
router.get(
  '/activity',
  handler(async (req, res) => {
    const data = await rows(
      `SELECT a.id, a.text, a.created_at, a.entity_type, a.entity_id,
              a.actor_id, p.name AS actor_name
         FROM activity a LEFT JOIN people p ON p.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 60`
    );
    res.json({ data });
  })
);

/**
 * Everything the company dashboard shows, computed in Postgres rather than by
 * pulling every row into the browser. Commercial figures are omitted entirely
 * for members — not hidden in the UI, absent from the response.
 */
router.get(
  '/dashboard',
  handler(async (req, res) => {
    const commercial = ['ADMIN', 'MANAGER'].includes(req.user.role);

    const [delivery, squads, velocity, defects, support, releases, capacity] = await Promise.all([
      one(`SELECT
             count(*) FILTER (WHERE status NOT IN ('Launched','On hold'))::int AS live,
             count(*) FILTER (WHERE health IN ('At risk','Critical'))::int      AS at_risk,
             count(*)::int                                                      AS total
           FROM projects`),
      rows(`SELECT department,
                   count(*) FILTER (WHERE status <> 'Done')::int          AS open,
                   count(*) FILTER (WHERE status = 'In progress')::int    AS in_flight,
                   count(*) FILTER (WHERE status = 'Blocked')::int        AS blocked
              FROM tasks GROUP BY department ORDER BY department`),
      rows(`SELECT name, completed_points, committed_points, end_on
              FROM sprints WHERE status = 'Completed'
             ORDER BY end_on NULLS LAST LIMIT 8`),
      rows(`SELECT severity, count(*)::int AS count
              FROM bugs WHERE status NOT IN ('Closed','Won''t fix')
             GROUP BY severity`),
      one(`SELECT
             count(*) FILTER (WHERE status NOT IN ('Resolved','Closed'))::int AS open,
             count(*) FILTER (WHERE status NOT IN ('Resolved','Closed')
                               AND sla_due_at < now())::int                   AS breached
           FROM tickets`),
      rows(`SELECT name, status, target_on FROM releases
             WHERE status <> 'Live' ORDER BY target_on NULLS LAST LIMIT 6`),
      one(`SELECT COALESCE(sum(capacity_hours), 0)::float AS capacity,
                  count(*)::int AS headcount
             FROM people WHERE status <> 'Notice'`),
    ]);

    const payload = {
      delivery,
      squads,
      velocity,
      defects,
      support,
      releases,
      capacity,
      projectHealth: await rows(`SELECT health, count(*)::int AS count FROM projects GROUP BY health`),
      taskStatus: await rows(`SELECT status, count(*)::int AS count FROM tasks GROUP BY status`),
    };

    if (commercial) {
      payload.pipeline = await rows(
        `SELECT stage, count(*)::int AS count, COALESCE(sum(value), 0)::float AS value
           FROM deals GROUP BY stage`
      );
      payload.weighted = await one(
        `SELECT COALESCE(sum(value * probability / 100.0), 0)::float AS weighted,
                COALESCE(sum(value), 0)::float AS open_value
           FROM deals WHERE stage NOT IN ('Won','Lost')`
      );
      payload.won = await one(
        `SELECT count(*)::int AS count, COALESCE(sum(value), 0)::float AS value
           FROM deals WHERE stage = 'Won'`
      );
      payload.revenueByClient = await rows(
        `SELECT c.name, COALESCE(c.arr, 0)::float AS arr FROM clients c
          WHERE c.arr > 0 ORDER BY c.arr DESC LIMIT 8`
      );
      payload.invoices = await rows(
        `SELECT status, count(*)::int AS count, COALESCE(sum(amount), 0)::float AS amount
           FROM invoices GROUP BY status`
      );
    }

    res.json({ data: payload });
  })
);

/**
 * Allocated hours per person per week, spread across each open ticket's dates.
 * Doing this in SQL keeps the capacity planner fast as the ticket count grows.
 */
router.get(
  '/capacity',
  handler(async (req, res) => {
    if (req.user.role === 'MEMBER') throw forbidden('Capacity planning is for managers');
    const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 1), 26);

    const data = await rows(
      `WITH week_series AS (
         SELECT generate_series(
           date_trunc('week', CURRENT_DATE),
           date_trunc('week', CURRENT_DATE) + ($1::int - 1) * INTERVAL '1 week',
           INTERVAL '1 week'
         )::date AS week_start
       ),
       spread AS (
         SELECT t.assignee_id,
                w.week_start,
                t.estimate_hours
                  * GREATEST(0, LEAST(t.due_on, w.week_start + 4) - GREATEST(t.start_on, w.week_start) + 1)
                  / NULLIF(t.due_on - t.start_on + 1, 0) AS hours
           FROM tasks t
           CROSS JOIN week_series w
          WHERE t.status <> 'Done'
            AND t.assignee_id IS NOT NULL
            AND t.start_on IS NOT NULL AND t.due_on IS NOT NULL
            AND t.due_on >= w.week_start AND t.start_on <= w.week_start + 6
       )
       SELECT p.id AS person_id, p.name, p.department, p.capacity_hours::float,
              w.week_start,
              COALESCE(ROUND(sum(s.hours)::numeric, 1), 0)::float AS allocated,
              EXISTS (
                SELECT 1 FROM leave_requests l
                 WHERE l.person_id = p.id AND l.status = 'Approved'
                   AND l.start_on <= w.week_start + 6 AND l.end_on >= w.week_start
              ) AS on_leave
         FROM people p
         CROSS JOIN week_series w
         LEFT JOIN spread s ON s.assignee_id = p.id AND s.week_start = w.week_start
        WHERE p.status <> 'Notice'
        GROUP BY p.id, p.name, p.department, p.capacity_hours, w.week_start
        ORDER BY p.department, p.name, w.week_start`,
      [weeks]
    );

    res.json({ data });
  })
);

/** Burndown for one sprint: ideal line, and points still open on each working day. */
router.get(
  '/burndown/:sprintId',
  handler(async (req, res) => {
    const sprintId = Number(req.params.sprintId);
    const sprint = await one('SELECT * FROM sprints WHERE id = $1', [sprintId]);
    if (!sprint || !sprint.start_on || !sprint.end_on) return res.json({ data: null });

    const days = await rows(
      `SELECT d::date AS day FROM generate_series($1::date, $2::date, INTERVAL '1 day') d
        WHERE EXTRACT(ISODOW FROM d) < 6`,
      [sprint.start_on, sprint.end_on]
    );

    const burned = await rows(
      `SELECT done_on, COALESCE(sum(points), 0)::int AS points
         FROM tasks WHERE sprint_id = $1 AND status = 'Done' AND done_on IS NOT NULL
        GROUP BY done_on ORDER BY done_on`,
      [sprintId]
    );

    const total = sprint.committed_points || 0;
    const today = new Date().toISOString().slice(0, 10);
    let running = 0;
    const series = days.map((row, i) => {
      running += burned.filter((b) => b.done_on === row.day).reduce((s, b) => s + b.points, 0);
      return {
        day: row.day,
        ideal: Math.round((total - (total / Math.max(days.length - 1, 1)) * i) * 10) / 10,
        actual: row.day <= today ? Math.max(0, total - running) : null,
      };
    });

    res.json({ data: { sprint: sprint.name, committed: total, series } });
  })
);

export default router;
