const express = require('express');
const cors = require('cors');
const compression = require('compression');
const timeoutMiddleware = require('./middlewares/timeout.middleware');
const authRoutes = require('./routes/auth.routes');
const ipRoutes = require('./routes/ip.routes');
require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');  // เพิ่มการ import axios


const app = express();
const port = process.env.PORT || 3000;
const host = process.env.NETWORK_HOST || 'localhost';

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(timeoutMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/ip', ipRoutes);

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));

cron.schedule('00 18 * * *', async () => {
  try {
    console.log('[CRON] Running /check-ips at 18:00');

    const response = await axios.post(`http://${host}:${port}/api/ip/check-ips`);
    console.log(`[CRON] /check-ips complete. Checked: ${response.data?.count || 0} IPs at ${new Date().toLocaleString()}`);
  } catch (error) {
    console.error('[CRON] Error calling /check-ips:', error.message);
  }
});