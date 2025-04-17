const pool = require('../models/db');

exports.getProtocols = async () => {
  const result = await pool.query(`
    SELECT * FROM internet_protocols ORDER BY internet_protocol_id LIMIT 5
  `);
  return result.rows;
};
