// src/api/auth/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const Logger = require('../../utils/logger');
const { JWT_SECRET } = require('../../config/environment');

async function login(req, res) {
  const { personnel_username, personnel_password } = req.body;
  
  if (!personnel_username || !personnel_password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT personnel_id, personnel_username, personnel_password
       FROM personnel
       WHERE personnel_username = $1`,
      [personnel_username]
    );
    
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(personnel_password, user.personnel_password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.personnel_id, username: user.personnel_username },
      JWT_SECRET,
      { expiresIn: '300s' }
    );
    
    res.json({
      token,
      user: {
        id: user.personnel_id,
        username: user.personnel_username
      }
    });

  } catch (err) {
    Logger.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

function verifyToken(req, res) {
  res.json({ user: req.user });
}

module.exports = {
  login,
  verifyToken
};