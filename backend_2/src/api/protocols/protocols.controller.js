// src/api/protocols/protocols.controller.js
const protocolsService = require('./protocols.service');
const pingService = require('../../services/ping.service');
const Logger = require('../../utils/logger');

async function getProtocols(req, res) {
  try {
    const protocols = await protocolsService.getProtocols();
    res.json(protocols);
  } catch (err) {
    Logger.error('Error fetching protocols:', err);
    res.status(500).json({ error: 'Error fetching data' });
  }
}

async function checkSingleIP(req, res) {
  const ip = req.params.ip;
  try {
    const status = await pingService.pingHost(ip);
    res.json({ ip, status });
  } catch (error) {
    Logger.error(`Error checking IP ${ip}:`, error);
    res.status(500).json({ error: 'Error checking IP' });
  }
}

async function checkAllIPs(req, res) {
  try {
    const startTime = Date.now();
    const ips = await protocolsService.getIPsFromDB();
    
    if (!ips || ips.length === 0) {
      return res.status(404).json({ error: 'No IPs found' });
    }
    
    Logger.log(`Retrieved ${ips.length} IPs from database in ${Date.now() - startTime}ms`);
    
    const results = await pingService.processPingBatches(ips);
    
    // Update database with IP status results
    const dbUpdateStart = Date.now();
    const dbUpdateResults = await protocolsService.updateIPStatusInDB(results);
    Logger.log(`Database update completed in ${Date.now() - dbUpdateStart}ms`);
    
    const totalTime = Date.now() - startTime;
    Logger.log(`Total processing time: ${totalTime}ms for ${Object.keys(results).length} IPs`);
    
    res.json({
      results,
      timestamp: Date.now(),
      count: Object.keys(results).length,
      processingTime: totalTime,
      dbUpdate: dbUpdateResults
    });
  } catch (error) {
    Logger.error('Error in check-ips:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
}

module.exports = {
  getProtocols,
  checkSingleIP,
  checkAllIPs
};