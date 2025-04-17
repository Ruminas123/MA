// src/app.js
const express = require('express');
const path = require('path');
const setupMiddleware = require('./config/middleware');
const apiRoutes = require('./api/routes');
const ErrorHandler = require('./utils/error-handler');
const os = require('os');

function createApp() {
  const app = express();
  
  // Setup middleware
  setupMiddleware(app);
  
  // Serve static files
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
  });
  
  // API routes
  app.use('/api', apiRoutes);
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpus: os.cpus().length,
      loadavg: os.loadavg(),
      freeMemory: os.freemem() / os.totalmem()
    });
  });
  
  // Backwards compatibility for old endpoints
  app.get('/check-ip/:ip', (req, res) => {
    const ip = req.params.ip;
    res.redirect(307, `/api/protocols/check-ip/${ip}`);
  });
  
  app.post('/check-ips', (req, res) => {
    res.redirect(307, '/api/protocols/check-ips');
  });
  
  // Error handling
  app.use(ErrorHandler.notFound);
  app.use(ErrorHandler.handleError);
  
  return app;
}

module.exports = createApp;