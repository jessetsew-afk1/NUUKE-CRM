import { query } from '../db.js';

/**
 * Appends to the shared activity feed. Never throws into a request: a feed entry
 * failing is not a reason for the write the user asked for to fail.
 */
export async function logActivity(actorId, text, entityType = null, entityId = null) {
  try {
    await query(
      `INSERT INTO activity (actor_id, text, entity_type, entity_id) VALUES ($1,$2,$3,$4)`,
      [actorId ?? null, text, entityType, entityId]
    );
    // Keep the feed bounded so it never becomes the biggest table in the database.
    await query(
      `DELETE FROM activity WHERE id < (SELECT COALESCE(MIN(id), 0) FROM (
         SELECT id FROM activity ORDER BY id DESC LIMIT 500) keep)`
    );
  } catch (err) {
    console.warn('Could not write activity entry:', err.message);
  }
}
