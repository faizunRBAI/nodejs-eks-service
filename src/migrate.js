'use strict';

/**
 * Database migration runner.
 *
 * Runs all SQL migrations in db/migrations/ in filename order.
 * Each migration is idempotent (CREATE TABLE IF NOT EXISTS, etc.)
 * so it is safe to run on every deploy.
 *
 * Called by the db-migrate Kubernetes Job in the configure pipeline stage.
 * Reads DATABASE_URL from the environment (injected via the app-database Secret).
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    console.error('DATABASE_URL is not set — cannot run migrations');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found — nothing to do.');
      process.exit(0);
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
      console.log(`Completed: ${file}`);
    }

    console.log('All migrations complete.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
