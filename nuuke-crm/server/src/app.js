import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env, isProd } from './env.js';
import { requireAuth, requireStaff } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { crudRouter } from './lib/crud.js';
import { resourceNames } from './domain/resources.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import metaRoutes from './routes/meta.js';
import nestedRoutes from './routes/nested.js';
import insightRoutes from './routes/insights.js';
import portalRoutes from './routes/portal.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!isProd) app.use(morgan('dev'));

  app.use(rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Slow down a moment — too many requests.' },
  }));

  app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);

  // Everything past here needs a session.
  app.use('/api', requireAuth);

  // The portal is the only surface a CLIENT login can reach.
  app.use('/api/portal', portalRoutes);

  // Everything below is staff-only.
  app.use('/api', requireStaff);
  app.use('/api/meta', metaRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/insights', insightRoutes);
  app.use('/api/:resource', nestedRoutes);

  for (const name of resourceNames) {
    app.use(`/api/${name}`, crudRouter(name));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
