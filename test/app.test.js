'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');

const app = require('../src/app');

test('GET /health reports ok without touching the database', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.uptime_s, 'number');
});

test('GET /ready is ready when no database is configured', async () => {
  const res = await request(app).get('/ready');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.database, 'not configured');
});

test('GET /api/info describes the running service', async () => {
  const res = await request(app).get('/api/info');
  assert.equal(res.status, 200);
  assert.equal(res.body.service, 'nodejs-eks-service');
  assert.equal(res.body.database, 'none');
});

test('GET / serves the operator page', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
});

test('unknown routes answer 404 as JSON', async () => {
  const res = await request(app).get('/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'not found');
});

test('GET /api/items returns 503 when database is not configured', async () => {
  // DATABASE_URL is not set in the test environment — items route is not mounted.
  const res = await request(app).get('/api/items');
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'database not configured');
});
