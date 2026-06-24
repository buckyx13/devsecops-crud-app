/**
 * server.js - Application entrypoint.
 * Wires up DB connection, security middleware, routes, and HTTP server.
 */
require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./db/pool');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Backend API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
