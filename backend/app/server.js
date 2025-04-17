const express = require('express');
const ping = require('ping');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');
const cluster = require('cluster');
const os = require('os');
const { Worker } = require('worker_threads');
const path = require('path');
const http = require('http');
require('dotenv').config();

const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const MAX_WORKERS = process.env.MAX_WORKERS ? parseInt(process.env.MAX_WORKERS) : Math.max(os.cpus().length - 1, 1);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;
const MAX_CONCURRENT_PINGS = process.env.MAX_CONCURRENT_PINGS ? parseInt(process.env.MAX_CONCURRENT_PINGS) : 100;
const PING_TIMEOUT = process.env.PING_TIMEOUT ? parseInt(process.env.PING_TIMEOUT) : 2;
const host = '0.0.0.0';

if (ENABLE_CLUSTERING && cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  
  for (let i = 0; i < MAX_WORKERS; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  startServer();
}

function startServer() {
  const app = express();
  const port = 2000;
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  
  pool.connect((err, client, release) => {
    if (err) {
      return console.error('Error connecting to database:', err);
    }
    console.log('Database connected');
    release();
  });
  
  app.use(compression({ level: 6 }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '1mb' }));
  
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }
  
  const timeoutMiddleware = (req, res, next) => {
    const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 120000;
    res.setTimeout(timeout, () => {
      console.log('Request timed out:', req.originalUrl);
      res.status(503).json({ error: 'Request timed out' });
    });
    next();
  };
  
  app.use(timeoutMiddleware);
  
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/index.html'));
  });
  
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcrypt');

  const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(400).json({ message: 'Invalid Token' });
    }
  };

  // Endpoint สำหรับตรวจสอบ token
  app.get('/api/auth/verify', authenticateToken, (req, res) => {
    // ถ้า token ถูกต้อง ส่งข้อมูลผู้ใช้ที่เกี่ยวข้อง
    res.json({ user: req.user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { personnel_username, personnel_password } = req.body;
    if (!personnel_username || !personnel_password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
  
    try {
      const result = await pool.query(
        `SELECT personnel_id, personnel_username, personnel_password
         FROM personnel
         WHERE personnel_username = $1`,
        [personnel_username]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      const isMatch = await bcrypt.compare(personnel_password, user.personnel_password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      const token = jwt.sign(
        { id: user.personnel_id, username: user.personnel_username },
        process.env.JWT_SECRET,
        { expiresIn: '10s' }
      );
      res.json({
        token,
        user: {
          id: user.personnel_id,
          username: user.personnel_username
        }
      });
  
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  
  app.get('/api/protocols', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM internet_protocols
        ORDER BY internet_protocol_id
        LIMIT 5
      `);
      
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching protocols:', err);
      res.status(500).json({ error: 'Error fetching data' });
    }
  });
  
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
  
  async function getIPsFromDB() {
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
        LIMIT 50
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }
  
  async function updateIPStatusInDB(ipResults) {
    if (!ipResults || Object.keys(ipResults).length === 0) {
      return { success: false, message: 'No results to update', updatedCount: 0 };
    }
    
    const client = await pool.connect();
    let updatedCount = 0;
    
    try {
      await client.query('BEGIN');
      
      for (const ip in ipResults) {
        const data = ipResults[ip];
        if (data && data.id && data.status) {
          const result = await client.query(
            `UPDATE internet_protocols 
             SET internet_protocol_status = $1
             WHERE internet_protocol_id = $2`,
            [data.status, data.id]
          );
          
          if (result.rowCount > 0) {
            updatedCount++;
          }
        }
      }
      
      await client.query('COMMIT');
      console.log(`Successfully updated ${updatedCount} IP statuses in database`);
      return { success: true, updatedCount };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating IP statuses in database:', error);
      return { success: false, error: error.message, updatedCount: 0 };
    } finally {
      client.release();
    }
  }
  
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
  
  app.post('/check-ips', async (req, res) => {
    try {
      const startTime = Date.now();
      const ips = await getIPsFromDB();
      
      if (!ips || ips.length === 0) {
        return res.status(404).json({ error: 'No IPs found' });
      }
      
      console.log(`Retrieved ${ips.length} IPs from database in ${Date.now() - startTime}ms`);
      
      const batches = [];
      for (let i = 0; i < ips.length; i += BATCH_SIZE) {
        batches.push(ips.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Processing ${batches.length} batches with batch size ${BATCH_SIZE}`);
      
      const results = {};
      
      const processBatches = async () => {
        const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);
        
        for (let i = 0; i < batches.length; i += concurrentBatches) {
          const batchPromises = batches
            .slice(i, i + concurrentBatches)
            .map(batch => processBatchInWorker(batch));
          
          const batchResults = await Promise.all(batchPromises);
          
          batchResults.forEach(batchResult => {
            Object.assign(results, batchResult);
          });
          
          console.log(`Processed ${Math.min((i + concurrentBatches), batches.length)} of ${batches.length} batches`);
        }
      };
      
      await processBatches();
      
      // Update database with IP status results
      const dbUpdateStart = Date.now();
      const dbUpdateResults = await updateIPStatusInDB(results);
      console.log(`Database update completed in ${Date.now() - dbUpdateStart}ms`);
      
      const totalTime = Date.now() - startTime;
      console.log(`Total processing time: ${totalTime}ms for ${Object.keys(results).length} IPs`);
      
      res.json({
        results,
        timestamp: Date.now(),
        count: Object.keys(results).length,
        processingTime: totalTime,
        dbUpdate: dbUpdateResults
      });
    } catch (error) {
      console.error('Error in check-ips:', error);
      res.status(500).json({ error: 'Server error', message: error.message });
    }
  });
  
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
  
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
  });
  
  app.listen(port, host, () => {
    console.log(`Server ${process.pid} running on http://${host}:${port}`);
  });
}