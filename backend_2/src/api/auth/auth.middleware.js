// src/api/auth/auth.middleware.js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../config/environment');

function authenticateToken(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ message: 'Access Denied' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid Token' });
  }
}

module.exports = {
  authenticateToken
};
