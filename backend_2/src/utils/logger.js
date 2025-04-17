// src/utils/logger.js
const { NODE_ENV } = require('../config/environment');

class Logger {
  static log(message, data) {
    if (NODE_ENV !== 'test') {
      console.log(`[INFO] ${message}`, data || '');
    }
  }
  
  static error(message, error) {
    console.error(`[ERROR] ${message}`, error || '');
  }
  
  static debug(message, data) {
    if (NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, data || '');
    }
  }
  
  static request(req) {
    if (NODE_ENV === 'development') {
      console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    }
  }
}

module.exports = Logger;