const express = require('express');
const router = express.Router();
const ipController = require('../controllers/ip.controller');

router.get('/check-ip/:ip', ipController.checkIP);
router.post('/check-ips', ipController.checkIPs);

module.exports = router;
