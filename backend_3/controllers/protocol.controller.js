const protocolService = require('../services/protocol.service');

exports.getProtocols = async (req, res) => {
  try {
    const protocols = await protocolService.getProtocols();
    res.json(protocols);
  } catch (err) {
    console.error('Error fetching protocols:', err);
    res.status(500).json({ error: 'Error fetching protocols' });
  }
};
