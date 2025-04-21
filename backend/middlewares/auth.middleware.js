const jwt = require('jsonwebtoken');

exports.authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) { return res.status(403).json({ message: 'Access denied' })}

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {return res.status(403).json({ message: 'Invalid token' })}
    req.user = user;
    next();
  });
};
