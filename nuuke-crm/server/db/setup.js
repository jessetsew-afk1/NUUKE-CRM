/**
 * Creates the schema. Destructive: it drops every application table first.
 *   npm run db:setup          — asks before dropping if tables already exist
 *   npm run db:setup --force  — drops without asking (use in CI)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { pool, one } from '../src/db.js';
import { OPTIONS, labels } from '../src/domain/options.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
const force = process.argv.includes('--force');

/**
 * Guards against options.js and schema.sql drifting apart. Every label listed in
 * options.js must appear somewhere in the CHECK constraints, or a write the API
 * accepts would be rejected by the database at runtime.
 */
function assertOptionsMatchSchema() {
  const missing = [];
  for (const key of Object.keys(OPTIONS)) {
    for (const label of labels(key)) {
      const needle = `'${label.replace(/'/g, "''")}'`;
      if (!sql.includes(needle)) missing.push(`${key} → ${label}`);
    }
  }
  if (missing.length) {
    console.error('\nschema.sql is missing values declared in src/domain/options.js:\n');
    missing.forEach((m) => console.error(`  ${m}`));
    console.error('\nAdd them to the matching CHECK constraint and run setup again.\n');
    process.exit(1);
  }
}

async function main() {
  assertOptionsMatchSchema();

  const existing = await one(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('people','tasks','users')`
  );

  if (existing.n > 0 && !force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      'This database already has Nuuke tables. Running setup DROPS them and all their data. Type "drop" to continue: '
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'drop') {
      console.log('Cancelled. Nothing was changed.');
      await pool.end();
      process.exit(0);
    }
  }

  await pool.query(sql);
  console.log('Schema created. Next: npm run db:seed');
  await pool.end();
}

main().catch(async (err) => {
  console.error('\nSchema setup failed:', err.message);
  if (err.code === 'ECONNREFUSED' || err.code === '3D000') {
    console.error('\nCheck DATABASE_URL in server/.env and that the database exists:');
    console.error('  createdb nuuke_crm\n');
  }
  await pool.end().catch(() => {});
  process.exit(1);
});
