'use strict';

const app = require('./app');
const db = require('./db');

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port }));
});

/**
 * Graceful shutdown is what makes the rolling update actually zero-downtime:
 * Kubernetes sends SIGTERM, stops routing new traffic, and this drains the
 * in-flight requests instead of dropping them.
 */
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));

  const force = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'forced exit after drain timeout' }));
    process.exit(1);
  }, 15000);
  force.unref();

  server.close(async () => {
    try {
      await db.close();
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'db close failed', err: err.message }));
    }
    clearTimeout(force);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
