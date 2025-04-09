const express = require('express');
const ping = require('ping');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error(err);
  }
  console.log('Database connected');
  release();
});

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/protocols', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM internet_protocols');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

async function pingHost(ip) {
  try {
    const response = await ping.promise.probe(ip, {
      timeout: 2,
      extra: process.platform === 'win32' ? ['-n', '1'] : ['-c', '1'],
    });

    return response.alive ? 'Online' : 'Offline';
  } catch (error) {
    console.error(error);
    return 'Error';
  }
}

async function getIPsFromDB() {
  try {
    const result = await pool.query(`
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
    return result.rows;
  } catch (error) {
    console.error(error);
    return [];
  }
}

app.get('/check-ip/:ip', async (req, res) => {
  const ip = req.params.ip;
  try {
    const status = await pingHost(ip);
    res.json({ ip, status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error checking IP' });
  }
});

app.post('/check-ips', async (req, res) => {
  try {
    const ips = await getIPsFromDB();
    if (!ips || ips.length === 0) {
      return res.status(404).json({ error: 'No IPs found' });
    }

    const results = {};

    await Promise.all(ips.map(async (ipRow) => {
      try {
        const ip = ipRow.internet_protocol;
        if (!ip) return;

        const pingStatus = await pingHost(ip);

        results[ip] = {
          id: ipRow.internet_protocol_id,
          name: ipRow.internet_protocol_project,
          status: pingStatus,
          latitude: parseFloat(ipRow.internet_protocol_latitude) || 0,
          longitude: parseFloat(ipRow.internet_protocol_longtitude) || 0,
        };
      } catch (ipError) {
        console.error(ipError);
      }
    }));

    res.json({
      results,
      timestamp: Date.now(),
      count: Object.keys(results).length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
