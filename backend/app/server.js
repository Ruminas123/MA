const express = require('express');
const ping = require('ping');
const cors = require('cors');
const pg = require('pg-promise')();
const app = express();
const port = process.env.PORT || 5000;

// Database connection with optimized connection pooling
const db = pg({
  connectionString: 'postgres://postgres:abc@1234@localhost:5432/ma_project',
  max: 20, // Increased from 10 to 20 for better parallel processing
  idleTimeoutMillis: 30000, 
  query_timeout: 5000 // Reduced timeout for faster query completion
});

// Enable CORS and JSON parsing with compression
const compression = require('compression');
app.use(compression()); // Add compression for faster data transfer
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Ping helper function with optimized timeout settings
async function pingHost(ip) {
  try {
    // Use optimized ping settings
    const response = await ping.promise.probe(ip, {
      timeout: 2, // Reduced from 5 to 2 seconds for faster response
      extra: process.platform === 'win32' ? ['-n', '1'] : ['-c', '1'], // Single ping for speed
    });

    const status = response.alive ? 'Online' : 'Offline';
    return status;
  } catch (error) {
    console.error(`Error pinging ${ip}:`, error);
    return 'Error';
  }
}

// Fetch IPs from DB with optimized query
async function getIPsFromDB() {
  try {
    // Use a more optimized query with specific column selection
    const rows = await db.any(`
      SELECT 
        internet_protocol_id,
        internet_protocol,
        internet_protocol_project,
        internet_protocol_latitude,
        internet_protocol_longtitude
      FROM internet_protocols
      WHERE internet_protocol IS NOT NULL 
      ORDER BY internet_protocol_id
    `);
    
    return rows;
  } catch (error) {
    console.error('Database error:', error);
    return [];
  }
}

// Single IP route
app.get('/check-ip/:ip', async (req, res) => {
  const ip = req.params.ip;
  try {
    const status = await pingHost(ip);
    res.json({ ip, status });
  } catch (error) {
    console.error('Error checking single IP:', error);
    res.status(500).json({ error: 'Server error checking IP' });
  }
});

// Optimized batch route with parallel processing
app.post('/check-ips', async (req, res) => {
  try {
    const ips = await getIPsFromDB();
    if (!ips || ips.length === 0) {
      return res.status(404).json({ error: 'No IPs found in database' });
    }

    const results = {};
    
    // Process all IPs in parallel with Promise.all for maximum speed
    await Promise.all(ips.map(async (ipRow) => {
      try {
        const ip = ipRow.internet_protocol;
        if (!ip) return;
        
        const pingStatus = await pingHost(ip);

        // Include only necessary data in the result
        results[ip] = {
          id: ipRow.internet_protocol_id,
          name: ipRow.internet_protocol_project,
          status: pingStatus,
          latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
          longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
        };
      } catch (ipError) {
        console.error('Error processing an IP:', ipError);
      }
    }));

    // Return optimized response without unnecessary metadata
    res.json({
      results,
      timestamp: Date.now(),
      count: Object.keys(results).length
    });
  } catch (error) {
    console.error('Error in batch IP check:', error);
    res.status(500).json({ error: 'Server error during batch check' });
  }
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime()
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});