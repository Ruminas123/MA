const ipService = require('../services/ip.service');

exports.checkIP = async (req, res) => {
  try {
    const { ip } = req.params;
    const status = await ipService.pingHost(ip);
    res.json({ ip, status });
  } catch (error) {
    console.error(`Error checking IP ${ip}:`, error);
    res.status(500).json({ error: 'Error checking IP' });
  }
};

exports.checkIPs = async (req, res) => {
  try {
    const results = await ipService.processIPBatches();
    res.json(results);
  } catch (error) {
    console.error('Error checking IPs:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
