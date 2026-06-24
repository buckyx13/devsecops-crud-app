/**
 * app.js - Express application configuration.
 * Security hardening: helmet (secure headers), rate limiting, CORS allowlist,
 * input validation (in routes/items.js), and no stack traces leaked to clients.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const itemsRouter = require('./routes/items');

const app = express();

// Security headers
app.use(helmet());

// Restrict CORS to configured origin only (default: nginx frontend origin)
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:8080';
app.use(cors({ origin: allowedOrigin }));

// Body parsing with size limit to mitigate payload-based DoS
app.use(express.json({ limit: '10kb' }));

// Request logging
app.use(morgan('combined'));

// Basic rate limiting to slow brute force / scraping
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Health checks used by Docker/K8s probes
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/ready', (req, res) => res.status(200).json({ status: 'ready' }));

// API routes
app.use('/api/items', itemsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler - never leak stack traces to client
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

module.exports = app;
