import mysql from 'mysql2/promise';

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 30000, // 30 seconds to establish connection (Railway internal can be slow)
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      idleTimeout: 60000,
    });
    console.log('🔧 MySQL pool created with timeouts');
  }
  return pool;
}

export default {
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
};
