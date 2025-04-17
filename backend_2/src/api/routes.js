// src/api/routes.js
const express = require('express');
const router = express.Router();
const authRoutes = require('./auth/auth.routes');
const protocolsRoutes = require('./protocols/protocols.routes');

// Register routes
router.use('/auth', authRoutes);
router.use('/protocols', protocolsRoutes);

module.exports = router;