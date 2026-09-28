import express from 'express';
import { OPTIONS, ROLES, CLIENT_VISIBLE_TASK_STATUS } from '../domain/options.js';
import { RESOURCES, MEMBER_BLOCKED } from '../domain/resources.js';

const router = express.Router();

/**
 * Everything the React app needs to render option pickers and hide controls the
 * signed-in role cannot use. Fetched once at boot so the two never drift.
 */
router.get('/', (req, res) => {
  const { role } = req.user;

  const permissions = Object.fromEntries(
    Object.entries(RESOURCES).map(([name, cfg]) => [
      name,
      {
        read: cfg.read.includes(role),
        write: cfg.write.includes(role) && (role !== 'MEMBER' || cfg.memberCreate || cfg.memberOwn !== null),
        create: cfg.write.includes(role) && (role !== 'MEMBER' || cfg.memberCreate === true),
        remove: cfg.remove.includes(role),
        ownOnly: role === 'MEMBER' && cfg.memberOwn !== null,
        ownField: role === 'MEMBER' ? cfg.memberOwn : null,
      },
    ])
  );

  res.json({
    data: {
      options: OPTIONS,
      roles: ROLES,
      clientVisibleTaskStatus: CLIENT_VISIBLE_TASK_STATUS,
      permissions,
      blockedForMembers: MEMBER_BLOCKED,
      today: new Date().toISOString().slice(0, 10),
    },
  });
});

export default router;
