// src/api/auth/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticateToken } = require('./auth.middleware');
const ErrorHandler = require('../../utils/error-handler');

router.post('/login', ErrorHandler.wrapAsync(authController.login));
router.get('/verify', authenticateToken, authController.verifyToken);

module.exports = router;