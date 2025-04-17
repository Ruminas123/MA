// src/utils/error-handler.js
const Logger = require('./logger');
const { NODE_ENV } = require('../config/environment');

class ErrorHandler {
  static handleError(err, req, res, next) {
    Logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  static notFound(req, res) {
    res.status(404).json({ error: 'Not found' });
  }
  
  static async wrapAsync(fn) {
    return function(req, res, next) {
      fn(req, res, next).catch(next);
    };
  }
}

module.exports = ErrorHandler;