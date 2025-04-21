const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware'); // Destructure the middleware

// Login route
router.post('/login', authController.login);

// Token verification route
router.get('/verify', authenticateToken, authController.verifyToken);

module.exports = router;
