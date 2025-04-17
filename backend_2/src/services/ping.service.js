// src/services/ping.service.js
const ping = require('ping');
const { Worker } = require('worker_threads');
const path = require('path');
const Logger = require('../utils/logger');
const { PING_TIMEOUT, BATCH_SIZE, MAX_CONCURRENT_PINGS } = require('../config/environment');

async function pingHost(ip) {
  try {
    const response = await ping.promise.probe(ip, {
      timeout: PING_TIMEOUT,
      extra: process.platform === 'win32' ? 
        ['-n', '1'] : 
        ['-c', '1', '-W', PING_TIMEOUT.toString()],
    });
    
    return response.alive ? 'Online' : 'Offline';
  } catch (error) {
    Logger.error(`Error pinging ${ip}:`, error.message);
    return 'Error';
  }
}

async function processBatchInWorker(ipBatch) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, '../workers/ping-worker.js'),
      { 
        workerData: { 
          ipBatch, 
          timeout: PING_TIMEOUT 
        } 
      }
    );
    
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

async function processPingBatches(ips) {
  // Split IPs into batches
  const batches = [];
  for (let i = 0; i < ips.length; i += BATCH_SIZE) {
    batches.push(ips.slice(i, i + BATCH_SIZE));
  }
  
  Logger.log(`Processing ${batches.length} batches with batch size ${BATCH_SIZE}`);
  
  const results = {};
  
  // Process batches with concurrency control
  const concurrentBatches = Math.min(MAX_CONCURRENT_PINGS / BATCH_SIZE, batches.length);
  
  for (let i = 0; i < batches.length; i += concurrentBatches) {
    const batchPromises = batches
      .slice(i, i + concurrentBatches)
      .map(batch => processBatchInWorker(batch));
    
    const batchResults = await Promise.all(batchPromises);
    
    batchResults.forEach(batchResult => {
      Object.assign(results, batchResult);
    });
    
    Logger.log(`Processed ${Math.min((i + concurrentBatches), batches.length)} of ${batches.length} batches`);
  }
  
  return results;
}

module.exports = {
  pingHost,
  processBatchInWorker,
  processPingBatches
};