// routes/ip.routes.js
const express = require('express');
const router = express.Router();

// ตัวอย่าง route
router.get('/check-ips', (req, res) => {
  res.send('IP check route working');
});

module.exports = router;
