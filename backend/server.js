//project/server.js
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const timeoutMiddleware = require('./middlewares/timeout.middleware');
const authRoutes = require('./routes/auth.routes');
const ipRoutes = require('./routes/ip.routes');
require('dotenv').config();
const cron = require('node-cron');

const { check_status_ip, save_log_data } = require('./controllers/ip.controller');

const app = express();
const port = process.env.PORT || 3090;
const host = process.env.NETWORK_HOST || 'localhost';

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(timeoutMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/ip', ipRoutes);

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(port, '0.0.0.0', () =>
  console.log(`Server running on port ${port}`)
);

// Cron job ทุกวันเวลา 17:00
cron.schedule("0 17 * * *", async () => {
  try {
    let resultData = null;
    const res = { json: (data) => { resultData = data; } };
    await check_status_ip({}, res);
    await save_log_data(resultData);
    console.log("✅ Cron job สำเร็จ เวลา 17:00");
  } catch (err) {
    console.error("❌ Cron job error:", err.message);
  }
});
