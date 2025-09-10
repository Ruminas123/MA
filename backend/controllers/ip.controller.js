//project/controllers/ip.controller.js
const { Pool } = require('pg');
const { Worker } = require('worker_threads');
const os = require('os');
const ping = require('ping');

// Configuration
const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const MAX_WORKERS = process.env.MAX_WORKERS ? parseInt(process.env.MAX_WORKERS) : Math.max(os.cpus().length - 1, 1);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;
const MAX_CONCURRENT_PINGS = process.env.MAX_CONCURRENT_PINGS ? parseInt(process.env.MAX_CONCURRENT_PINGS) : 100;
const PING_TIMEOUT = process.env.PING_TIMEOUT ? parseInt(process.env.PING_TIMEOUT) : 2;

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
    const query = `
      UPDATE internet_protocols
      SET internet_protocol_status = $1,
          internet_protocol_time_update = NOW()
      WHERE internet_protocol_ip = $2
    `;

    const result = await pool.query(query, [status, ip]);

    if (result.rowCount === 0) {
      console.warn(`No rows updated for IP: ${ip}. IP may not exist in database.`);
    }

    return result.rowCount > 0;
  } catch (error) {
    console.error(`Failed to update IP ${ip}:`, error);
    return false;
  }
}

// Function to handle batch processing of IPs using Worker Threads
async function processBatchInWorker(ipBatch) {
  return new Promise((resolve, reject) => {
    const workerCode = `
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
          console.error('Ping error for', ip, ':', error.message);
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
        console.error('Worker batch processing error:', err);
        parentPort.postMessage({ error: err.message });
      });
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        ipBatch,
        timeout: PING_TIMEOUT
      }
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    // Set timeout for worker to prevent hanging
    setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker timeout'));
    }, 30000); // 30 second timeout
  });
}

// Alternative simple ping function without workers (fallback)
async function simplePingBatch(ipBatch) {
  const results = {};
  const statusUpdates = [];

  const pingPromises = ipBatch.map(async (ipRow) => {
    const ip = ipRow.internet_protocol_ip;
    if (!ip) return;

    try {
      const response = await ping.promise.probe(ip, {
        timeout: PING_TIMEOUT,
        extra: process.platform === 'win32' ? ['-n', '1'] : ['-c', '1', '-W', PING_TIMEOUT.toString()],
      });

      const status = response.alive ? 'Online' : 'Offline';
      statusUpdates.push({ ip, status });

      results[ip] = {
        id: ipRow.internet_protocol_id,
        name: ipRow.internet_protocol_project,
        status: status,
        latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
        longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
      };
    } catch (error) {
      console.error(`Ping error for ${ip}:`, error.message);
      const status = 'Error';
      statusUpdates.push({ ip, status });

      results[ip] = {
        id: ipRow.internet_protocol_id,
        name: ipRow.internet_protocol_project,
        status: status,
        latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
        longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
      };
    }
  });

  await Promise.all(pingPromises);
  return { results, statusUpdates };
}

// Main controller function
exports.check_status_ip = async (req, res) => {
  try {
    const startTime = Date.now();
    const ips = await getIPsFromDB();

    if (!ips || ips.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No IPs found',
        count: 0,
        processingTime: Date.now() - startTime
      });
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
    let successfulUpdates = 0;

    // Process batches with concurrency control
    const processBatches = async () => {
      // Calculate concurrent batches to avoid overloading
      const concurrentBatches = Math.min(
        Math.ceil(MAX_CONCURRENT_PINGS / BATCH_SIZE),
        batches.length,
        MAX_WORKERS || 4
      );

      console.log(`Processing with ${concurrentBatches} concurrent batches`);

      for (let i = 0; i < batches.length; i += concurrentBatches) {
        const currentBatches = batches.slice(i, i + concurrentBatches);

        // Use workers if enabled, otherwise use simple ping
        const batchPromises = currentBatches.map(batch => {
          if (ENABLE_CLUSTERING) {
            return processBatchInWorker(batch).catch(error => {
              console.warn('Worker failed, falling back to simple ping:', error.message);
              return simplePingBatch(batch);
            });
          } else {
            return simplePingBatch(batch);
          }
        });

        try {
          const batchResults = await Promise.allSettled(batchPromises);

          // Process each batch result
          for (const batchResult of batchResults) {
            if (batchResult.status === 'rejected') {
              console.error('Batch processing failed:', batchResult.reason);
              continue;
            }

            const { results: batchResultsData, statusUpdates } = batchResult.value;

            // Check if there was an error in the batch
            if (batchResult.value.error) {
              console.error('Batch processing error:', batchResult.value.error);
              continue;
            }

            // Merge results
            if (batchResultsData) {
              Object.assign(results, batchResultsData);
            }

            // Process status updates from batch
            if (statusUpdates && Array.isArray(statusUpdates)) {
              // console.log(`Processing ${statusUpdates.length} status updates`);

              // Update IP statuses in the database
              for (const update of statusUpdates) {
                try {
                  const updateSuccess = await updateIPStatusInDB(update.ip, update.status);
                  statusUpdateResults.push({
                    ip: update.ip,
                    status: update.status,
                    updated: updateSuccess
                  });

                  if (updateSuccess) {
                    successfulUpdates++;
                  }
                } catch (error) {
                  console.error(`Failed to update ${update.ip}:`, error);
                  statusUpdateResults.push({
                    ip: update.ip,
                    status: update.status,
                    updated: false,
                    error: error.message
                  });
                }
              }
            }
          }

          // Log progress
          const processedBatches = Math.min(i + concurrentBatches, batches.length);
          console.log(`Processed ${processedBatches} of ${batches.length} batches`);

        } catch (error) {
          console.error('Error processing batch group:', error);
        }
      }
    };

    await processBatches();

    const totalTime = Date.now() - startTime;
    const resultCount = Object.keys(results).length;

    console.log(`Total processing time: ${totalTime}ms for ${resultCount} IPs`);
    console.log(`Successful status updates: ${successfulUpdates}/${statusUpdateResults.length}`);

    // Summary statistics
    const statusCounts = statusUpdateResults.reduce((acc, update) => {
      acc[update.status] = (acc[update.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      results,
      statusUpdates: statusUpdateResults,
      summary: {
        totalIPs: ips.length,
        processedIPs: resultCount,
        successfulUpdates,
        failedUpdates: statusUpdateResults.length - successfulUpdates,
        statusCounts,
        processingTime: totalTime,
        batchCount: batches.length,
        batchSize: BATCH_SIZE
      },
      timestamp: Date.now(),
      count: resultCount
    });

  } catch (error) {
    console.error('Error in check_status_ip:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
      timestamp: Date.now()
    });
  }
};

// Optional: Function to close the database pool (for graceful shutdown)
exports.closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
};

exports.save_log_data = async (data) => {
  try {
    if (!data) {
      console.warn("⚠️ ไม่มีข้อมูลส่งเข้ามา save_log_data");
      return null;
    }

    const jsonData = JSON.stringify(data);

    // หา log_status_id ล่าสุด
    const getLastId = await pool.query(`SELECT MAX(log_status_id) AS last_id FROM log_status`);
    const nextId = (getLastId.rows[0].last_id || 0) + 1;

    // insert โดยใช้ nextId
    const query = `
      INSERT INTO log_status (log_status_id, log_status_data, log_status_timestamp)
      VALUES ($1, $2, NOW())
      RETURNING log_status_id, log_status_timestamp
    `;
    const values = [nextId, jsonData];

    const result = await pool.query(query, values);

    console.log("✅ บันทึก log สำเร็จ:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("❌ Error saving log data:", error.message);
    throw error;
  }
};

