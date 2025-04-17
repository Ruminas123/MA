// src/config/database.js
const { Pool } = require('pg');
const { DB_CONFIG } = require('./environment');

const pool = new Pool(DB_CONFIG);

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to database:', err);
  }
  console.log('Database connected');
  release();
});

module.exports = pool;