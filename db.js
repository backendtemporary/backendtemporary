import mysql from 'mysql2/promise';

let pool;

function getPool() {
  if (!pool) {
    // Railway auto-provides MYSQL_URL / DATABASE_URL with host, port, user, pass, db all included.
    // Use that if available; fall back to individual env vars.
    const connectionUri = process.env.MYSQL_URL || process.env.DATABASE_URL;

    if (connectionUri) {
      console.log('🔧 MySQL pool: using connection string (MYSQL_URL / DATABASE_URL)');
      pool = mysql.createPool({
        uri: connectionUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
    } else {
      console.log('🔧 MySQL pool: using individual DB_* env vars');
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
    }
  }
  return pool;
}

export default {
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
};
