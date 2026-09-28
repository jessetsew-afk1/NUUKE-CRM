import { createApp } from './app.js';
import { env } from './env.js';
import { pool } from './db.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Nuuke API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`Allowing the app at ${env.CLIENT_ORIGIN}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received — closing.`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
