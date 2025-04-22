const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { Worker } = require('worker_threads');
const os = require('os');
const ping = require('ping');
const { authenticateToken } = require('../middlewares/auth.middleware'); // Destructure the middleware

// Configuration
const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const MAX_WORKERS = process.env.MAX_WORKERS ? parseInt(process.env.MAX_WORKERS) : Math.max(os.cpus().length - 1, 1);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;
const MAX_CONCURRENT_PINGS = process.env.MAX_CONCURRENT_PINGS ? parseInt(process.env.MAX_CONCURRENT_PINGS) : 100;
const PING_TIMEOUT = process.env.PING_TIMEOUT ? parseInt(process.env.PING_TIMEOUT) : 2;
const host = '0.0.0.0';

// PostgreSQL pool setup
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

// Cache for IP data
const ipDataCache = {
  data: null,
  timestamp: 0,
  ttl: 60000 * 5, // Cache TTL (5 minutes)

  isValid() {
    return this.data && (Date.now() - this.timestamp < this.ttl);
  },

  update(data) {
    this.data = data;
    this.timestamp = Date.now();
  }
};

// Get IPs from the database
async function getIPsFromDB() {
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

// Function to update IP status in the database
async function updateIPStatusInDB(ip, status) {
  try {
    // ตรวจสอบโครงสร้างตาราง (ถ้าไม่มี updated_at ให้ไม่ใส่)
    const checkTableStructure = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'internet_protocols' 
      AND column_name = 'updated_at'
    `);
    
    let query;
    if (checkTableStructure.rows.length > 0) {
      // ถ้ามี updated_at column
      query = `
        UPDATE internet_protocols
        SET internet_protocol_status = $1, updated_at = NOW()
        WHERE internet_protocol_ip = $2
      `;
    } else {
      // ถ้าไม่มี updated_at column
      query = `
        UPDATE internet_protocols
        SET internet_protocol_status = $1
        WHERE internet_protocol_ip = $2
      `;
    }
    
    const result = await pool.query(query, [status, ip]);
    console.log(`Updated IP ${ip} status to ${status}. Rows affected: ${result.rowCount}`);
    
    if (result.rowCount === 0) {
      console.warn(`No rows updated for IP: ${ip}. IP may not exist in database.`);
    }
  } catch (error) {
    console.error(`Failed to update IP ${ip}:`, error);
  }
}

// Function to handle batch processing of IPs
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
        const statusUpdates = [];
        
        const promises = workerData.ipBatch.map(async (ipRow) => {
          const ip = ipRow.internet_protocol_ip;
          if (!ip) return;

          const status = await pingHost(ip, workerData.timeout);
          
          // Store status update for the main thread to process
          statusUpdates.push({ ip, status });

          results[ip] = {
            id: ipRow.internet_protocol_id,
            name: ipRow.internet_protocol_project,
            status: status,
            latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
            longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
          };
        });

        await Promise.all(promises);
        parentPort.postMessage({ results, statusUpdates });
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

// Route to get the IPs from the database
router.post('/get-ips', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM internet_protocols
      ORDER BY internet_protocol_id ASC
    `);

    res.json({
      count: result.rows.length,
      results: result.rows,
      fetchedAt: new Date()
    });
  } catch (error) {
    console.error('Error fetching IPs:', error);
    res.status(500).json({ error: 'Database query failed', message: error.message });
  }
});

// Route for checking IPs and updating their status
router.post('/check-ips', async (req, res) => {
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
    const statusUpdateResults = [];

    // Process batches with concurrency control
    const processBatches = async () => {
      // Process batches in chunks to avoid overloading the system
      const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);

      for (let i = 0; i < batches.length; i += concurrentBatches) {
        const batchPromises = batches
          .slice(i, i + concurrentBatches)
          .map(batch => processBatchInWorker(batch));

        const batchResults = await Promise.all(batchPromises);

        // Process each batch result
        for (const batchResult of batchResults) {
          // Check if there was an error
          if (batchResult.error) {
            console.error('Batch processing error:', batchResult.error);
            continue;
          }
          
          // Merge results
          Object.assign(results, batchResult.results);
          
          // Process status updates from worker
          if (batchResult.statusUpdates && Array.isArray(batchResult.statusUpdates)) {
            console.log(`Received ${batchResult.statusUpdates.length} status updates to process`);
            
            // Update IP statuses in the database one by one
            for (const update of batchResult.statusUpdates) {
              await updateIPStatusInDB(update.ip, update.status);
              statusUpdateResults.push({
                ip: update.ip,
                status: update.status,
                updated: true
              });
            }
          }
        }

        // Log progress
        console.log(`Processed ${Math.min((i + concurrentBatches), batches.length)} of ${batches.length} batches`);
      }
    };

    await processBatches();

    const totalTime = Date.now() - startTime;
    console.log(`Total processing time: ${totalTime}ms for ${Object.keys(results).length} IPs`);
    console.log(`Status updates performed: ${statusUpdateResults.length}`);
    
    res.json({
      results,
      statusUpdates: statusUpdateResults,
      timestamp: Date.now(),
      count: Object.keys(results).length,
      processingTime: totalTime
    });
  } catch (error) {
    console.error('Error in check-ips:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// Export the router so it can be used in `server.js`
module.exports = router;