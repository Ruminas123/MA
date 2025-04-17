const ping = require('ping');
const pool = require('../models/db');
const { Worker } = require('worker_threads');
const { PING_TIMEOUT, BATCH_SIZE, MAX_CONCURRENT_PINGS } = process.env;

exports.pingHost = async (ip) => {
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
};

exports.processIPBatches = async () => {
  const ips = await this.getIPsFromDB();
  const batches = this.createBatches(ips);

  const results = {};

  const processBatches = async () => {
    const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);
    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const batchPromises = batches
        .slice(i, i + concurrentBatches)
        .map(batch => this.processBatchInWorker(batch));

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(batchResult => {
        Object.assign(results, batchResult);
      });
    }
  };

  await processBatches();

  return results;
};

exports.getIPsFromDB = async () => {
  const result = await pool.query(`
    SELECT internet_protocol_id, internet_protocol_ip, internet_protocol_project
    FROM internet_protocols WHERE internet_protocol_ip IS NOT NULL AND internet_protocol_ip != ''
    ORDER BY internet_protocol_id LIMIT 50
  `);
  return result.rows;
};

exports.createBatches = (ips) => {
  const batches = [];
  for (let i = 0; i < ips.length; i += BATCH_SIZE) {
    batches.push(ips.slice(i, i + BATCH_SIZE));
  }
  return batches;
};

exports.processBatchInWorker = (ipBatch) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('../utils/pingWorker.js', { workerData: { ipBatch, timeout: PING_TIMEOUT } });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
};
