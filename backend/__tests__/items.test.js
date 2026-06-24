/**
 * items.test.js - Integration tests for CRUD endpoints.
 *
 * Unlike MongoDB, there's no lightweight in-memory Postgres for Node, so
 * these tests run against a REAL PostgreSQL instance. Locally, run:
 *   docker compose -f docker-compose.test.yml up -d
 * In CI (GitHub Actions / Jenkins), a Postgres service container is used
 * (see .github/workflows/ci-cd.yml). Connection details come from env vars
 * with sensible localhost defaults for convenience.
 */
const request = require('supertest');

process.env.PGHOST = process.env.PGHOST || 'localhost';
process.env.PGPORT = process.env.PGPORT || '5432';
process.env.PGUSER = process.env.PGUSER || 'appuser';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'testpass';
process.env.PGDATABASE = process.env.PGDATABASE || 'cruddb_test';
process.env.CORS_ORIGIN = 'http://localhost:8080';

const { pool, connectDB, closeDB } = require('../src/db/pool');
const app = require('../src/app');

beforeAll(async () => {
  await connectDB();
  // Ensure schema exists (mirrors postgres-init/init.sql, scoped to test DB).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500) DEFAULT '',
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('TRUNCATE TABLE items;');
});

afterAll(async () => {
  await pool.query('TRUNCATE TABLE items;');
  await closeDB();
});

describe('Items CRUD API', () => {
  let createdId;

  test('POST /api/items creates an item', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ name: 'Widget', description: 'A test widget', quantity: 5 });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Widget');
    createdId = res.body.id;
  });

  test('POST /api/items rejects invalid payload', async () => {
    const res = await request(app).post('/api/items').send({ quantity: -1 });
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/items returns list', async () => {
    const res = await request(app).get('/api/items');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/items/:id returns single item', async () => {
    const res = await request(app).get(`/api/items/${createdId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(createdId);
  });

  test('GET /api/items/:id with malformed id returns 400', async () => {
    const res = await request(app).get('/api/items/not-a-uuid');
    expect(res.statusCode).toBe(400);
  });

  test('PUT /api/items/:id updates item', async () => {
    const res = await request(app)
      .put(`/api/items/${createdId}`)
      .send({ quantity: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body.quantity).toBe(10);
  });

  test('DELETE /api/items/:id deletes item', async () => {
    const res = await request(app).delete(`/api/items/${createdId}`);
    expect(res.statusCode).toBe(200);
  });

  test('GET /api/items/:id after delete returns 404', async () => {
    const res = await request(app).get(`/api/items/${createdId}`);
    expect(res.statusCode).toBe(404);
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });
});
