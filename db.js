import mysql from 'mysql2/promise';

let pool;

function getPool() {
  if (!pool) {
    // Railway provides MySQL connection strings under various names.
    // Try them all. MYSQL_PRIVATE_URL is for internal networking (preferred in Railway).
    const connectionUri =
      process.env.MYSQL_PRIVATE_URL ||
      process.env.MYSQL_URL ||
      process.env.DATABASE_PRIVATE_URL ||
      process.env.DATABASE_URL;

    if (connectionUri) {
      console.log('🔧 MySQL pool: using connection string');
      pool = mysql.createPool({
        uri: connectionUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 30000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: {
          rejectUnauthorized: false
        }
      });
    } else {
      console.log('🔧 MySQL pool: using individual DB_* env vars');
      console.log(`   DB_HOST=${process.env.DB_HOST}, DB_PORT=${process.env.DB_PORT}, DB_NAME=${process.env.DB_NAME}, DB_USER=${process.env.DB_USER}`);
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 60000, // Increased for stability
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: {
          rejectUnauthorized: false
        }
      });
    }
  }
  return pool;
}

export default {
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
};
