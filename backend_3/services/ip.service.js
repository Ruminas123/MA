const path = require('path');
const { Worker } = require('worker_threads');
const ping = require('ping');
const pool = require('../models/db');
require('dotenv').config();

const { PING_TIMEOUT = 2, BATCH_SIZE = 50, MAX_CONCURRENT_PINGS = 100 } = process.env;

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

exports.getIPsFromDB = async () => {
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
    const worker = new Worker(path.resolve(__dirname, '../utils/pingWorker.js'), {
      workerData: { ipBatch, timeout: PING_TIMEOUT },
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
};

exports.processIPBatches = async () => {
  const ips = await this.getIPsFromDB();
  const batches = this.createBatches(ips);
  const results = {};

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

  return {
    results,
    timestamp: Date.now(),
    count: Object.keys(results).length,
  };
};
