//project/middlewares/timeout.middleware.js
module.exports = (req, res, next) => {
  const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 120000;
  res.setTimeout(timeout, () => {
    console.log('Request timed out:', req.originalUrl);
    res.status(503).json({ error: 'Request timed out' });
  });
  next();
};
