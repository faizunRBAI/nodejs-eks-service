'use strict';

const path = require('path');
const express = require('express');

const db = require('./db');
const itemsRouter = require('./routes/items');

const startedAt = Date.now();

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Structured one-line access log — CloudWatch and `kubectl logs` both read it.
app.use((req, res, next) => {
  const began = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - began) / 1e6;
    console.log(
      JSON.stringify({
        level: 'info',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.round(ms),
      })
    );
  });
  next();
});

// The operator UI. Served at / because the platform's verify stage expects a
// real page there, not a JSON blob.
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

/**
 * Liveness: is this process still able to serve? It deliberately does NOT
 * touch the database — a database outage must not make Kubernetes restart
 * healthy pods in a loop.
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    version: process.env.APP_VERSION || 'dev',
  });
});

/**
 * Readiness: should this pod receive traffic? This one DOES check the
 * database, but only when a database is configured — so the same manifest
 * works with `database=none`.
 */
app.get('/ready', async (_req, res) => {
  if (!db.isConfigured()) {
    res.json({ status: 'ready', database: 'not configured' });
    return;
  }
  try {
    await db.ping();
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', database: 'unreachable', error: err.message });
  }
});

app.get('/api/info', (_req, res) => {
  res.json({
    service: 'nodejs-eks-service',
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    database: db.isConfigured() ? 'configured' : 'none',
    started_at: new Date(startedAt).toISOString(),
  });
});

// Items CRUD — only mounted when a database is configured.
if (db.isConfigured()) {
  app.use('/api/items', itemsRouter);
} else {
  app.get('/api/items', (_req, res) => {
    res.status(503).json({ error: 'database not configured' });
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled', err: err.message }));
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
