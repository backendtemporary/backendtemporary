import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('   Please add them to your .env file');
  process.exit(1);
}

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: true
};

// Create connection pool
let pool = null;

try {
  pool = mysql.createPool(dbConfig);
  console.log('🔧 MySQL connection pool created');
} catch (err) {
  console.error('❌ Failed to create connection pool:', err.message);
  process.exit(1);
}

// Test connection on startup
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL database connected successfully');
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Pool size: ${dbConfig.connectionLimit}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   → Invalid username or password');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   → Database does not exist');
    } else if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('   → Connection lost');
    }
    console.error('   Check your .env file and database credentials');
  });

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Unexpected pool error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    await pool.end();
    console.log('✅ Database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing pool:', err.message);
    process.exit(1);
  }
});

export default pool;
