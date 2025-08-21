const express = require('express');
const router = express.Router();
const apiController = require('../controllers/ip.controller');

router.get('/check_status_ips', apiController.check_status_ip);

module.exports = router;