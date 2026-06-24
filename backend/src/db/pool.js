/**
 * db/pool.js - PostgreSQL connection pool via node-postgres (pg).
 * Credentials are injected via environment variables (see k8s Secret),
 * never hardcoded. Using a Pool (not a single client) lets the backend
 * handle concurrent requests efficiently and is safe to share across
 * the app's lifetime.
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'appuser',
  password: process.env.PGPASSWORD || 'changeme_in_production',
  database: process.env.PGDATABASE || 'cruddb',
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Catches idle client errors so a single bad connection doesn't crash the process.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function connectDB() {
  // Simple connectivity check at startup; fail fast if DB is unreachable.
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } finally {
    client.release();
  }
}

async function closeDB() {
  await pool.end();
}

module.exports = { pool, connectDB, closeDB };
