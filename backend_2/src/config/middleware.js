// src/config/middleware.js
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const Logger = require('../utils/logger');
const { REQUEST_TIMEOUT, NODE_ENV } = require('./environment');

function setupMiddleware(app) {
  // Apply compression
  app.use(compression({ level: 6 }));
  
  // Enable CORS
  app.use(cors({ origin: '*' }));
  
  // Parse JSON requests
  app.use(express.json({ limit: '1mb' }));
  
  // Request logging in development
  if (NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      Logger.request(req);
      next();
    });
  }
  
  // Request timeout
  app.use((req, res, next) => {
    const timeout = REQUEST_TIMEOUT;
    res.setTimeout(timeout, () => {
      Logger.error('Request timed out:', req.originalUrl);
      res.status(503).json({ error: 'Request timed out' });
    });
    next();
  });
}

module.exports = setupMiddleware;
