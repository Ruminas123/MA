// src/api/protocols/protocols.routes.js
const express = require('express');
const router = express.Router();
const protocolsController = require('./protocols.controller');
const ErrorHandler = require('../../utils/error-handler');

router.get('/', ErrorHandler.wrapAsync(protocolsController.getProtocols));
router.get('/check-ip/:ip', ErrorHandler.wrapAsync(protocolsController.checkSingleIP));
router.post('/check-ips', ErrorHandler.wrapAsync(protocolsController.checkAllIPs));

module.exports = router;
