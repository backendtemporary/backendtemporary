#!/usr/bin/env node
/**
 * Database Backup Script
 * Creates a MySQL dump of the database
 * 
 * Usage:
 *   node backup-database.js [output-file]
 * 
 * Example:
 *   node backup-database.js backup_2026-01-26.sql
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database credentials from environment variables
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

// Get output file from command line or use default
const outputFile = process.argv[2] || `backup_${new Date().toISOString().split('T')[0]}.sql`;
const outputPath = path.join(__dirname, outputFile);

// Validate required environment variables
if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
  process.exit(1);
}

async function createBackup() {
  try {
    console.log('🔄 Starting database backup...');
    console.log(`   Database: ${DB_NAME}`);
    console.log(`   Host: ${DB_HOST}:${DB_PORT}`);
    console.log(`   Output: ${outputPath}`);
    
    // Build mysqldump command
    // Note: mysqldump must be installed on the system
    // Escape special characters in password for Windows
    const escapedPassword = DB_PASSWORD.replace(/[&<>|]/g, '');
    const command = process.platform === 'win32'
      ? `mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p"${escapedPassword}" ${DB_NAME} > "${outputPath}"`
      : `mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p'${escapedPassword}' ${DB_NAME} > "${outputPath}"`;
    
    // Execute backup
    await execAsync(command, {
      shell: true,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Check if file was created and has content
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      if (stats.size > 0) {
        console.log(`✅ Backup created successfully!`);
        console.log(`   File: ${outputPath}`);
        console.log(`   Size: ${fileSizeMB} MB`);
        console.log(`\n💡 To restore this backup, use:`);
        console.log(`   mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_NAME} < ${outputPath}`);
      } else {
        console.error('❌ Error: Backup file is empty');
        process.exit(1);
      }
    } else {
      console.error('❌ Error: Backup file was not created');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error creating backup:', error.message);
    
    if (error.message.includes('mysqldump')) {
      console.error('\n💡 Make sure mysqldump is installed:');
      console.error('   - Windows: Install MySQL client tools');
      console.error('   - Linux: sudo apt-get install mysql-client');
      console.error('   - Mac: brew install mysql-client');
    }
    
    process.exit(1);
  }
}

// Run backup
createBackup();
