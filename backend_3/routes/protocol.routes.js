// routes/protocol.routes.js
const express = require('express');
const router = express.Router();

// ตัวอย่าง route
router.get('/protocol', (req, res) => {
  res.send('Protocol route working');
});

module.exports = router;
