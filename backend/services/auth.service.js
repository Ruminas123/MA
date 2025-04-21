const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../models/db');

exports.authenticateUser = async (username, password) => {
  // Update query to select the role column as well
  const result = await pool.query(
    `SELECT personnel_id, personnel_username, personnel_password, personnel_role FROM personnel WHERE personnel_username = $1`,
    [username]
  );
  const user = result.rows[0];
  
  // If no user is found, return null
  if (!user) return null;

  // Compare the provided password with the hashed password in the database
  const isMatch = await bcrypt.compare(password, user.personnel_password);

  // If passwords don't match, return null
  if (!isMatch) return null;

  // Return the user data, including role
  return { id: user.personnel_id, username: user.personnel_username, role: user.personnel_role };
};

exports.generateToken = (userData) => {
  // Generate a JWT token with user data (id, username, role)
  return jwt.sign({ id: userData.id, username: userData.username, role: userData.role }, process.env.JWT_SECRET, { expiresIn: '300s' });
};
