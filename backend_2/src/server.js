// src/server.js
const cluster = require('cluster');
const http = require('http');
const createApp = require('./app');
const { ENABLE_CLUSTERING, MAX_WORKERS, PORT, HOST } = require('./config/environment');
const Logger = require('./utils/logger');

// Setup clustering
if (ENABLE_CLUSTERING && cluster.isMaster) {
  Logger.log(`Master ${process.pid} is running`);
  
  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    Logger.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  // Start server
  const app = createApp();
  
  const server = http.createServer(app);
  
  server.listen(PORT, HOST, () => {
    Logger.log(`Server ${process.pid} running on http://${HOST}:${PORT}`);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    Logger.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      Logger.log('HTTP server closed');
      process.exit(0);
    });
  });
}