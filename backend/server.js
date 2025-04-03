const express = require('express');
const ping = require('ping');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

// Cache for IP check results
const ipStatusCache = new Map();
const CACHE_TTL = 10000; // Cache results for 10 seconds

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Middleware for logging requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Ping helper function to avoid code duplication
async function pingHost(ip) {
  try {
    // Check cache first
    const cachedResult = ipStatusCache.get(ip);
    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_TTL)) {
      console.log(`Cache hit for ${ip}: ${cachedResult.status}`);
      return cachedResult.status;
    }

    // No cache or expired, perform actual ping
    console.log(`Pinging ${ip}...`);
    const response = await ping.promise.probe(ip, {
      timeout: 5,
      extra: process.platform === 'win32' ? ['-n', '2'] : ['-c', '2'],
    });
    
    const status = response.alive ? 'Online' : 'Offline';
    
    // Update cache
    ipStatusCache.set(ip, { 
      status, 
      timestamp: Date.now(),
      responseTime: response.time
    });
    
    return status;
  } catch (error) {
    console.error(`Error pinging ${ip}:`, error);
    return 'Error';
  }
}

// Route to check a single IP
app.get('/check-ip/:ip', async (req, res) => {
  const ip = req.params.ip;
  try {
    const status = await pingHost(ip);
    res.json({ ip, status });
  } catch (error) {
    console.error('Error in /check-ip:', error);
    res.status(500).json({ error: 'Server error checking IP' });
  }
});

// Batch endpoint to check multiple IPs concurrently
app.post('/check-ips', async (req, res) => {
  const { ips } = req.body;
  
  if (!ips || !Array.isArray(ips)) {
    return res.status(400).json({ 
      error: 'Invalid request', 
      message: 'Expected array of IPs in request body' 
    });
  }
  
  console.log(`Batch checking ${ips.length} IPs`);
  
  try {
    // Process IPs in parallel using Promise.all for better performance
    const results = {};
    const pingPromises = ips.map(async (ip) => {
      results[ip] = await pingHost(ip);
    });
    
    await Promise.all(pingPromises);
    
    // Return response with timestamp for client reference
    res.json({ 
      results,
      timestamp: new Date().toISOString(),
      count: Object.keys(results).length
    });
  } catch (error) {
    console.error('Error in batch IP check:', error);
    res.status(500).json({ error: 'Server error during batch check' });
  }
});

// Cache management endpoint - allow clearing the cache
app.post('/clear-cache', (req, res) => {
  const size = ipStatusCache.size;
  ipStatusCache.clear();
  res.json({ message: `Cache cleared. Removed ${size} entries.` });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cacheSize: ipStatusCache.size
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});