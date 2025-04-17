// src/api/protocols/protocols.service.js
const pool = require('../../config/database');
const Logger = require('../../utils/logger');

async function getProtocols() {
  try {
    const result = await pool.query(`
      SELECT * FROM internet_protocols
      ORDER BY internet_protocol_id
      LIMIT 5
    `);
    
    return result.rows;
  } catch (error) {
    Logger.error('Error fetching protocols:', error);
    throw error;
  }
}

async function getIPsFromDB() {
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
      LIMIT 50
    `);
    
    return result.rows;
  } catch (error) {
    Logger.error('Database query error:', error);
    return [];
  }
}

async function updateIPStatusInDB(ipResults) {
  if (!ipResults || Object.keys(ipResults).length === 0) {
    return { success: false, message: 'No results to update', updatedCount: 0 };
  }
  
  const client = await pool.connect();
  let updatedCount = 0;
  
  try {
    await client.query('BEGIN');
    
    for (const ip in ipResults) {
      const data = ipResults[ip];
      if (data && data.id && data.status) {
        const result = await client.query(
          `UPDATE internet_protocols 
           SET internet_protocol_status = $1
           WHERE internet_protocol_id = $2`,
          [data.status, data.id]
        );
        
        if (result.rowCount > 0) {
          updatedCount++;
        }
      }
    }
    
    await client.query('COMMIT');
    Logger.log(`Successfully updated ${updatedCount} IP statuses in database`);
    return { success: true, updatedCount };
  } catch (error) {
    await client.query('ROLLBACK');
    Logger.error('Error updating IP statuses in database:', error);
    return { success: false, error: error.message, updatedCount: 0 };
  } finally {
    client.release();
  }
}

module.exports = {
  getProtocols,
  getIPsFromDB,
  updateIPStatusInDB
};