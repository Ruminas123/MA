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

// Cron job เวลา 06:00 - เช็คสถานะ IP + บันทึก log
cron.schedule("0 6 * * *", async () => {
  try {
    let resultData = null;
    const res = { json: (data) => { resultData = data; } };
    await check_status_ip({}, res);
    await save_log_data(resultData);
    console.log("✅ Cron job สำเร็จ เวลา 06:00 (บันทึก log แล้ว)");
  } catch (err) {
    console.error("❌ Cron job error (06:00):", err.message);
  }
});

// Cron job เวลา 12:00 - เช็คสถานะ IP อย่างเดียว ไม่บันทึก log
cron.schedule("0 12 * * *", async () => {
  try {
    let resultData = null;
    const res = { json: (data) => { resultData = data; } };
    await check_status_ip({}, res);
    console.log("✅ Cron job สำเร็จ เวลา 12:00 (ไม่บันทึก log)");
  } catch (err) {
    console.error("❌ Cron job error (12:00):", err.message);
  }
});