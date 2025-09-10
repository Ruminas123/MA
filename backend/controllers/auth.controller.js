//project/controllers/auth.controller.js
const authService = require('../services/auth.service');

exports.login = async (req, res) => {
  try {
    const { personnel_username, personnel_password } = req.body;
    const user = await authService.authenticateUser(personnel_username, personnel_password);
    if (!user) {return res.status(401).json({ message: 'Invalid credentials' })}
    const token = authService.generateToken(user);
    res.json({token, user: {id: user.id, username: user.username, role: user.role}});
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(401).json({ message: 'Invalid credentials' });
  }
};

exports.verifyToken = (req, res) => {res.json({ user: req.user })};

