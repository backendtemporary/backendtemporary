import mysql from 'mysql2/promise';

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000, // 10 seconds to establish connection
      acquireTimeout: 60000, // 60 seconds to get connection from pool
      timeout: 60000, // 60 seconds query timeout
    });
    console.log('🔧 MySQL pool created with timeouts');
  }
  return pool;
}

export default {
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
};
