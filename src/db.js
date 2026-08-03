'use strict';

/**
 * Optional Postgres access.
 *
 * The `database` module choice decides whether this blueprint provisions RDS.
 * With `database=none` the deploy never creates the `app-database` secret, so
 * DATABASE_URL is absent and the service runs statelessly. Everything here is
 * written for both cases: `isConfigured()` is the single question the rest of
 * the app asks.
 */

const fs = require('fs');
const { Pool } = require('pg');

const connectionString = (process.env.DATABASE_URL || '').trim();

/**
 * TLS settings for the database connection.
 *
 * RDS presents a certificate issued by a private Amazon CA, so the system trust
 * store cannot validate it on its own. The Dockerfile bakes in the RDS global
 * CA bundle and points DATABASE_SSL_CA at it, which is what lets this verify
 * the certificate properly.
 *
 * Verification is never silently disabled: `rejectUnauthorized: false` accepts
 * any certificate, including an attacker's, which turns an encrypted channel
 * into a false sense of security. Set DATABASE_SSL=disable for local
 * development against a plaintext Postgres — explicit and visible.
 */
function sslConfig() {
  if ((process.env.DATABASE_SSL || '').toLowerCase() === 'disable') {
    return false;
  }
  const caPath = (process.env.DATABASE_SSL_CA || '').trim();
  if (caPath && fs.existsSync(caPath)) {
    return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  }
  // No bundle present: still require a verified channel, against the system
  // trust store. Failing closed is deliberate.
  return { rejectUnauthorized: true };
}

let pool = null;
if (connectionString) {
  pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(),
  });

  // An idle client dying must never take the process with it.
  pool.on('error', (err) => {
    console.error(
      JSON.stringify({ level: 'error', msg: 'idle db client error', err: err.message })
    );
  });
}

function isConfigured() {
  return pool !== null;
}

/** Returns the Pool instance — only call when isConfigured() is true. */
function getPool() {
  if (!pool) {
    throw new Error('Database is not configured (DATABASE_URL is not set)');
  }
  return pool;
}

/** Cheap round-trip used by the readiness probe. Returns true when usable. */
async function ping() {
  if (!pool) return true;
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { isConfigured, getPool, ping, close };
