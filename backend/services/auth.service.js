const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../models/db');

exports.authenticateUser = async (username, password) => {
  const result = await pool.query(
    `SELECT personnel_id, personnel_username, personnel_password, personnel_role FROM personnel WHERE personnel_username = $1`,
    [username]
  );
  const user = result.rows[0];
  
  if (!user) return null;
  const isMatch = await bcrypt.compare(password, user.personnel_password);
  if (!isMatch) return null;
  return { id: user.personnel_id, username: user.personnel_username, role: user.personnel_role };
};

exports.generateToken = (userData) => {
  return jwt.sign({ id: userData.id, username: userData.username, role: userData.role }, process.env.JWT_SECRET, { expiresIn: '300s' });
};
