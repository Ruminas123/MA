const express = require('express');
const ping = require('ping');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');
const cluster = require('cluster');
const os = require('os');
const { Worker } = require('worker_threads');
const path = require('path');
require('dotenv').config();

// Determine if we should use clustering based on environment
const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const MAX_WORKERS = process.env.MAX_WORKERS ? parseInt(process.env.MAX_WORKERS) : Math.max(os.cpus().length - 1, 1);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;
const MAX_CONCURRENT_PINGS = process.env.MAX_CONCURRENT_PINGS ? parseInt(process.env.MAX_CONCURRENT_PINGS) : 100;
const PING_TIMEOUT = process.env.PING_TIMEOUT ? parseInt(process.env.PING_TIMEOUT) : 2;

// Only use clustering in production
if (ENABLE_CLUSTERING && cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  
  // Fork workers
  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    // Replace the dead worker
    cluster.fork();
  });
} else {
  // This is a worker process
  startServer();
}

function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  
  // Connection pool configuration with optimized settings
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // how long to wait for a connection
    statement_timeout: 5000, // abort any statement that takes more than 5s
  });
  
  // Initialize DB connection
  pool.connect((err, client, release) => {
    if (err) {
      return console.error('Error connecting to database:', err);
    }
    console.log('Database connected');
    release();
  });
  
  // Create a cache for IP data to reduce database hits
  const ipDataCache = {
    data: null,
    timestamp: 0,
    ttl: 60000 * 5, // 5 minutes cache TTL
    
    isValid() {
      return this.data && (Date.now() - this.timestamp < this.ttl);
    },
    
    update(data) {
      this.data = data;
      this.timestamp = Date.now();
    }
  };
  
  // Enhanced middleware stack
  app.use(compression({ level: 6 })); // Higher compression level
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  
  // Add request logging in development
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }
  
  // Middleware to check if the request has timed out
  const timeoutMiddleware = (req, res, next) => {
    const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 120000; // 2 minutes default
    res.setTimeout(timeout, () => {
      console.log('Request timed out:', req.originalUrl);
      res.status(503).json({ error: 'Request timed out' });
    });
    next();
  };
  
  app.use(timeoutMiddleware);
  
  // Root route
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
  });
  
  // Get all IP protocols
  app.get('/api/protocols', async (req, res) => {
    try {
      // Use caching for IP data
      if (ipDataCache.isValid()) {
        return res.json(ipDataCache.data);
      }
      
      const result = await pool.query(`
        SELECT * FROM internet_protocols
        ORDER BY internet_protocol_id
        LIMIT 1000
      `);
      
      ipDataCache.update(result.rows);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching protocols:', err);
      res.status(500).json({ error: 'Error fetching data' });
    }
  });
  
  // Optimized ping function with timeout
  async function pingHost(ip) {
    try {
      const response = await ping.promise.probe(ip, {
        timeout: PING_TIMEOUT,
        extra: process.platform === 'win32' ? ['-n', '1'] : ['-c', '1', '-W', PING_TIMEOUT.toString()],
      });
      
      return response.alive ? 'Online' : 'Offline';
    } catch (error) {
      console.error(`Error pinging ${ip}:`, error.message);
      return 'Error';
    }
  }
  
  // Retrieve IPs from database with optimization
  async function getIPsFromDB() {
    // Use caching for IP data
    if (ipDataCache.isValid()) {
      return ipDataCache.data;
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          internet_protocol_id,
          internet_protocol_ip,
          internet_protocol_project,
          internet_protocol_latitude,
          internet_protocol_longtitude
        FROM internet_protocols
        WHERE internet_protocol_ip IS NOT NULL AND internet_protocol_ip != ''
        ORDER BY internet_protocol_id
      `);
      
      ipDataCache.update(result.rows);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }
  
  // Process IP batches in parallel using worker threads
  async function processBatchInWorker(ipBatch) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('worker_threads');
        const ping = require('ping');
        
        async function pingHost(ip, timeout) {
          try {
            const response = await ping.promise.probe(ip, {
              timeout: timeout,
              extra: process.platform === 'win32' ? ['-n', '1'] : ['-c', '1', '-W', timeout.toString()],
            });
            
            return response.alive ? 'Online' : 'Offline';
          } catch (error) {
            return 'Error';
          }
        }
        
        async function processBatch() {
          const results = {};
          const promises = workerData.ipBatch.map(async (ipRow) => {
            const ip = ipRow.internet_protocol_ip;
            if (!ip) return;
            
            const status = await pingHost(ip, workerData.timeout);
            
            results[ip] = {
              id: ipRow.internet_protocol_id,
              name: ipRow.internet_protocol_project,
              status: status,
              latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
              longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
            };
          });
          
          await Promise.all(promises);
          parentPort.postMessage(results);
        }
        
        processBatch().catch(err => {
          parentPort.postMessage({ error: err.message });
        });
      `, { eval: true, workerData: { ipBatch, timeout: PING_TIMEOUT } });
      
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
  
  // Check a single IP
  app.get('/check-ip/:ip', async (req, res) => {
    const ip = req.params.ip;
    try {
      const status = await pingHost(ip);
      res.json({ ip, status });
    } catch (error) {
      console.error(`Error checking IP ${ip}:`, error);
      res.status(500).json({ error: 'Error checking IP' });
    }
  });
  
  // Optimized route to check all IPs
  app.post('/check-ips', async (req, res) => {
    try {
      const startTime = Date.now();
      const ips = await getIPsFromDB();
      
      if (!ips || ips.length === 0) {
        return res.status(404).json({ error: 'No IPs found' });
      }
      
      console.log(`Retrieved ${ips.length} IPs from database in ${Date.now() - startTime}ms`);
      
      // Create batches of IPs for parallel processing
      const batches = [];
      for (let i = 0; i < ips.length; i += BATCH_SIZE) {
        batches.push(ips.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Processing ${batches.length} batches with batch size ${BATCH_SIZE}`);
      
      const results = {};
      
      // Process batches with concurrency control
      const processBatches = async () => {
        // Process batches in chunks to avoid overloading the system
        const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);
        
        for (let i = 0; i < batches.length; i += concurrentBatches) {
          const batchPromises = batches
            .slice(i, i + concurrentBatches)
            .map(batch => processBatchInWorker(batch));
          
          const batchResults = await Promise.all(batchPromises);
          
          // Merge batch results
          batchResults.forEach(batchResult => {
            Object.assign(results, batchResult);
          });
          
          // Log progress
          console.log(`Processed ${Math.min((i + concurrentBatches), batches.length)} of ${batches.length} batches`);
        }
      };
      
      await processBatches();
      
      const totalTime = Date.now() - startTime;
      console.log(`Total processing time: ${totalTime}ms for ${Object.keys(results).length} IPs`);
      
      res.json({
        results,
        timestamp: Date.now(),
        count: Object.keys(results).length,
        processingTime: totalTime
      });
    } catch (error) {
      console.error('Error in check-ips:', error);
      res.status(500).json({ error: 'Server error', message: error.message });
    }
  });
  
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
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  });
  
  // Start the server
  app.listen(port, () => {
    console.log(`Server ${process.pid} running on http://localhost:${port}`);
  });
}