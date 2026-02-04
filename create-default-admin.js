// Script to create a default admin account
// Run with: node create-default-admin.js

import bcrypt from 'bcryptjs';
import db from './db.js';

const DEFAULT_ADMIN = {
  username: 'admin',
  email: 'admin@risetexco.com',
  password: 'admin123', // CHANGE THIS PASSWORD AFTER FIRST LOGIN!
  full_name: 'Administrator',
  role: 'admin'
};

async function createDefaultAdmin() {
  try {
    console.log('Creating default admin account...');
    
    // Check if admin already exists
    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [DEFAULT_ADMIN.username, DEFAULT_ADMIN.email]
    );
    
    if (existing.length > 0) {
      console.log('Admin account already exists!');
      return;
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
    
    // Insert admin user
    await db.query(
      'INSERT INTO users (username, email, password_hash, role, full_name) VALUES (?, ?, ?, ?, ?)',
      [DEFAULT_ADMIN.username, DEFAULT_ADMIN.email, passwordHash, DEFAULT_ADMIN.role, DEFAULT_ADMIN.full_name]
    );
    
    console.log('✓ Default admin account created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Login Credentials:');
    console.log('  Username or Email: admin');
    console.log('  Password: admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin account:', error);
    process.exit(1);
  }
}

createDefaultAdmin();

