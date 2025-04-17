// src/workers/ping-worker.js
const { parentPort, workerData } = require('worker_threads');
const ping = require('ping');

async function pingHost(ip, timeout) {
  try {
    const response = await ping.promise.probe(ip, {
      timeout: timeout,
      extra: process.platform === 'win32' ? 
        ['-n', '1'] : 
        ['-c', '1', '-W', timeout.toString()],
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