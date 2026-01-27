import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from './db.js';

import pool from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT;

console.log("=== SERVER STARTUP ===");
console.log("SERVER.JS LOADED — REAL FILE");
console.log("PORT:", PORT || "UNDEFINED");
console.log("NODE_ENV:", process.env.NODE_ENV || "development");
console.log("=========================");

app.get("/api/__prove", (req, res) => {
  res.send("PROVE ROUTE");
});



// Middleware
// CORS: permissive config to avoid preflight timeouts in production
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} from ${req.ip || req.connection.remoteAddress}`);
  console.log('  Origin:', req.headers.origin || 'none');
  console.log('  User-Agent:', req.headers['user-agent']?.substring(0, 50) || 'none');
  res.on('finish', () => {
    console.log(`  → ${res.statusCode} ${res.statusMessage || ''}`);
  });
  next();
});

// Root health checks for Elastic Beanstalk/ALB
app.get('/', (req, res) => {
  res.status(200).send('API is running');
});

app.get('/api', (req, res) => {
  res.status(200).send('API root');
});

// ============================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// ============================================

// Extract token from Authorization header
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

// Authentication middleware - verifies JWT token
const authMiddleware = async (req, res, next) => {
  // Allow public endpoints
  const publicPaths = ['/health', '/auth/login', '/auth/register'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists and get current role
    const [users] = await db.query('SELECT user_id, username, email, role, full_name FROM users WHERE user_id = ?', [decoded.userId]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Permission check middleware - requires specific role
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Apply auth middleware to protected routes (will be applied selectively)
// Public routes are handled individually

// ============================================
// AUDIT LOGGING HELPER FUNCTIONS
// ============================================

/**
 * Log an audit entry for database changes
 * @param {Object} params - Audit log parameters
 * @param {string} params.table_name - Name of the table
 * @param {number} params.record_id - ID of the record
 * @param {string} params.action - 'INSERT', 'UPDATE', or 'DELETE'
 * @param {Object} params.user - User object from req.user (optional)
 * @param {string} params.field_name - Field name (for single field updates)
 * @param {*} params.old_value - Old value (for UPDATE/DELETE)
 * @param {*} params.new_value - New value (for INSERT/UPDATE)
 * @param {Object} params.changes - Object with all field changes (for multi-field UPDATE)
 * @param {Object} params.req - Express request object (optional, for IP/user agent)
 * @param {string} params.notes - Additional notes
 */
const logAudit = async ({ table_name, record_id, action, user = null, field_name = null, old_value = null, new_value = null, changes = null, req = null, notes = null }) => {
  try {
    const userId = user ? user.user_id : null;
    const username = user ? user.username : null;
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim()) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    // Convert old_value and new_value to strings for storage
    const oldValueStr = old_value !== null && old_value !== undefined ? String(old_value) : null;
    const newValueStr = new_value !== null && new_value !== undefined ? String(new_value) : null;

    // If changes object provided, convert to JSON string
    let changesJson = null;
    if (changes && typeof changes === 'object') {
      try {
        changesJson = JSON.stringify(changes);
      } catch (e) {
        console.error('Error stringifying changes for audit log:', e);
      }
    }

    await db.query(
      `INSERT INTO audit_logs 
       (table_name, record_id, action, user_id, username, field_name, old_value, new_value, changes, ip_address, user_agent, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [table_name, record_id, action, userId, username, field_name, oldValueStr, newValueStr, changesJson, ipAddress, userAgent, notes]
    );
  } catch (error) {
    // Don't throw - audit logging should never break the main operation
    console.error('Error logging audit entry:', error);
  }
};

/**
 * Log an INSERT action
 */
const logInsert = async (table_name, record_id, user, newRecord, req = null, notes = null) => {
  // For INSERT, log all fields as changes
  const changes = {};
  for (const [key, value] of Object.entries(newRecord || {})) {
    if (value !== null && value !== undefined) {
      changes[key] = { old: null, new: value };
    }
  }
  await logAudit({
    table_name,
    record_id,
    action: 'INSERT',
    user,
    changes: Object.keys(changes).length > 0 ? changes : null,
    req,
    notes
  });
};

/**
 * Log an UPDATE action with before/after comparison
 */
const logUpdate = async (table_name, record_id, user, oldRecord, newRecord, req = null, notes = null) => {
  // Fields to exclude from audit logs (auto-managed by database)
  const excludedFields = new Set([
    'created_at',
    'updated_at',
    'created_by_user_id',  // We track this separately
    'updated_by_user_id'   // We track this separately
  ]);
  
  // Compare old and new records to find changes
  const changes = {};
  const allKeys = new Set([...Object.keys(oldRecord || {}), ...Object.keys(newRecord || {})]);
  
  for (const key of allKeys) {
    // Skip excluded fields
    if (excludedFields.has(key)) {
      continue;
    }
    
    const oldVal = oldRecord?.[key];
    const newVal = newRecord?.[key];
    
    // Only log if value actually changed (and both aren't null/undefined)
    if (oldVal !== newVal) {
      // Convert dates to strings for consistent comparison
      const oldValStr = oldVal instanceof Date ? oldVal.toISOString() : oldVal;
      const newValStr = newVal instanceof Date ? newVal.toISOString() : newVal;
      
      // Only log if they're actually different after string conversion
      if (String(oldValStr) !== String(newValStr)) {
        changes[key] = {
          old: oldValStr !== null && oldValStr !== undefined ? oldValStr : null,
          new: newValStr !== null && newValStr !== undefined ? newValStr : null
        };
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    await logAudit({
      table_name,
      record_id,
      action: 'UPDATE',
      user,
      changes: changes,
      req,
      notes
    });
  }
};

/**
 * Log a DELETE action
 */
const logDelete = async (table_name, record_id, user, deletedRecord, req = null, notes = null) => {
  const changes = {};
  for (const [key, value] of Object.entries(deletedRecord || {})) {
    if (value !== null && value !== undefined) {
      changes[key] = { old: value, new: null };
    }
  }
  await logAudit({
    table_name,
    record_id,
    action: 'DELETE',
    user,
    changes: Object.keys(changes).length > 0 ? changes : null,
    req,
    notes
  });
};

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================
// DESIGN NOTE: saveFabricStructure() uses incremental updates to preserve data:
// - UPDATE existing records (identified by fabric_id, color_id, roll_id)
// - INSERT new records (no ID provided)
// - DELETE only records explicitly removed from the payload
// - NEVER touches the logs table - preserves audit trail
// - Uses transactions to ensure consistency

// Build nested fabric structure from database (fabrics -> colors -> rolls)
const buildFabricStructure = async () => {
  try {
    const [fabrics] = await db.query('SELECT * FROM fabrics ORDER BY fabric_id');
    const [colors] = await db.query('SELECT * FROM colors ORDER BY fabric_id, color_id');
    // Only fetch rolls that are not sold (sold = false or NULL)
    const [rolls] = await db.query('SELECT * FROM rolls WHERE (sold = FALSE OR sold IS NULL) ORDER BY color_id, roll_id');

    // First pass: assign sequential color indices within each fabric
    const colorIndexMap = {}; // Maps color_id to its sequential index within fabric
    const colorsByFabric = {};
    colors.forEach(color => {
      if (!colorsByFabric[color.fabric_id]) colorsByFabric[color.fabric_id] = [];
      const colorIndex = colorsByFabric[color.fabric_id].length + 1; // 1-based
      colorIndexMap[color.color_id] = colorIndex;
      colorsByFabric[color.fabric_id].push(color);
    });

    // Build rolls with correct hierarchical IDs
    const rollsByColor = {};
    rolls.forEach(roll => {
      if (!rollsByColor[roll.color_id]) rollsByColor[roll.color_id] = [];
      
      // Get the fabric for this roll
      const color = colors.find(c => c.color_id === roll.color_id);
      if (!color) return;
      
      const fabric = fabrics.find(f => f.fabric_id === color.fabric_id);
      if (!fabric) return;
      
      // Extract fabric number from fabric_code (e.g., "FAB-001" -> "001")
      const fabricNum = (fabric.fabric_code || '').match(/FAB-(\d+)/)?.[1] || String(fabric.fabric_id).padStart(3, '0');
      const colorNum = String(colorIndexMap[roll.color_id]).padStart(3, '0');
      const rollNum = String(rollsByColor[roll.color_id].length + 1).padStart(3, '0');
      
      // Format date to YYYY-MM-DD (remove time component if present)
      let formattedDate = null;
      if (roll.date) {
        const dateStr = String(roll.date);
        // Extract just the date part (YYYY-MM-DD) - handles both DATE and DATETIME
        formattedDate = dateStr.split('T')[0].split(' ')[0];
        // Ensure it's valid YYYY-MM-DD format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
          console.warn('buildFabricStructure: Invalid date format from DB:', dateStr, 'for roll_id:', roll.roll_id)
          formattedDate = null;
        }
      }
      // CRITICAL FIX: Don't default to today if date is missing - use the date from DB even if null
      // Only default if we absolutely can't parse it (shouldn't happen for valid dates)
      if (!formattedDate && roll.date) {
        // Date exists but couldn't parse - try one more time with different approach
        try {
          const dbDate = new Date(roll.date);
          if (!isNaN(dbDate.getTime())) {
            formattedDate = dbDate.toISOString().split('T')[0];
          }
        } catch (e) {
          console.error('buildFabricStructure: Error parsing date:', roll.date, 'for roll_id:', roll.roll_id)
        }
      }
      // Only default to today if date is truly missing from DB (shouldn't happen due to NOT NULL constraint)
      if (!formattedDate) {
        console.warn('buildFabricStructure: Date missing for roll_id:', roll.roll_id, 'using today as fallback')
        formattedDate = new Date().toISOString().split('T')[0];
      }
      
      // FIX DISPLAY ISSUE: Include lot and roll_nb in the roll object
      rollsByColor[roll.color_id].push({
        roll_id: roll.roll_id,
        color_id: roll.color_id,
        fabric_id: roll.fabric_id,
        id: `FAB-${fabricNum}-COL-${colorNum}-ROL-${rollNum}`,
        date: formattedDate,
        length_meters: parseFloat(roll.length_meters),
        length_yards: parseFloat(roll.length_yards),
        isTrimmable: Boolean(roll.is_trimmable),
        weight: roll.weight || 'N/A',
        status: roll.status,
        // FIX DISPLAY ISSUE: Include lot and roll_nb from database
        lot: roll.lot || null,
        roll_nb: roll.roll_nb || null,
        created_at: roll.created_at,
        updated_at: roll.updated_at
      });
    });

    // Build colors with correct hierarchical IDs
    const finalColorsByFabric = {};
    Object.keys(colorsByFabric).forEach(fabricId => {
      const fabric = fabrics.find(f => f.fabric_id === parseInt(fabricId));
      const fabricNum = (fabric.fabric_code || '').match(/FAB-(\d+)/)?.[1] || String(fabricId).padStart(3, '0');
      
      finalColorsByFabric[fabricId] = colorsByFabric[fabricId].map((color, idx) => {
        const colorNum = String(idx + 1).padStart(3, '0');
        return {
          color_id: color.color_id,
          fabric_id: color.fabric_id,
          id: `FAB-${fabricNum}-COL-${colorNum}`,
          color_name: color.color_name,
          created_at: color.created_at,
          updated_at: color.updated_at,
          rolls: rollsByColor[color.color_id] || []
        };
      });
    });

    // Build final structure with stable DB IDs for log integrity
    return fabrics.map(fabric => ({
      fabric_id: fabric.fabric_id,
      fabric_name: fabric.fabric_name,
      fabric_code: fabric.fabric_code,
      main_code: fabric.main_code,
      source: fabric.source,
      design: fabric.design,
      created_at: fabric.created_at,
      updated_at: fabric.updated_at,
      colors: finalColorsByFabric[fabric.fabric_id] || []
    }));
  } catch (error) {
    console.error('Error building fabric structure:', error);
    throw error;
  }
};

// Build fabric+color structure (rolls are now attributes of colors)
// Returns fabrics with colors that have roll attributes directly
const buildFabricColorAggregatedStructure = async () => {
  try {
    const [fabrics] = await db.query(`
      SELECT f.*, 
        u_created.username as created_by_username, u_created.full_name as created_by_full_name,
        u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM fabrics f
      LEFT JOIN users u_created ON f.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON f.updated_by_user_id = u_updated.user_id
      ORDER BY f.fabric_id
    `);
    // Colors now have roll attributes directly (length_meters, length_yards, date, etc.)
    // Note: initial_length_meters and initial_length_yards may not exist in older schemas
    // Using SELECT * to handle missing columns gracefully (they'll be undefined if not present)
    const [colors] = await db.query(`
      SELECT c.*,
        u_created.username as created_by_username, u_created.full_name as created_by_full_name,
        u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM colors c
      LEFT JOIN users u_created ON c.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON c.updated_by_user_id = u_updated.user_id
      WHERE (c.sold = FALSE OR c.sold IS NULL OR c.sold = 0)
      ORDER BY c.fabric_id, c.color_id
    `);
    
    // Fetch all lots for all colors
    const [lots] = await db.query(`
      SELECT * FROM color_lots 
      ORDER BY color_id, lot_id
    `);
    
    // Group lots by color_id
    const lotsByColor = {};
    lots.forEach(lot => {
      if (!lotsByColor[lot.color_id]) {
        lotsByColor[lot.color_id] = [];
      }
      lotsByColor[lot.color_id].push({
        lot_id: lot.lot_id,
        color_id: lot.color_id,
        lot_number: lot.lot_number,
        length_meters: parseFloat(lot.length_meters) || 0,
        length_yards: parseFloat(lot.length_yards) || 0,
        initial_length_meters: lot.initial_length_meters ? parseFloat(lot.initial_length_meters) : null,
        initial_length_yards: lot.initial_length_yards ? parseFloat(lot.initial_length_yards) : null,
        date: lot.date,
        weight: lot.weight || null,
        roll_nb: lot.roll_nb || null,
        created_at: lot.created_at,
        updated_at: lot.updated_at
      });
    });
    
    // Build colors with roll attributes directly
    const colorsByFabric = {};
    colors.forEach(color => {
      if (!colorsByFabric[color.fabric_id]) {
        colorsByFabric[color.fabric_id] = [];
      }
      
      // Extract fabric number from fabric_code (e.g., "FAB-001" -> "001")
      const fabric = fabrics.find(f => f.fabric_id === color.fabric_id);
      const fabricNum = (fabric?.fabric_code || '').match(/FAB-(\d+)/)?.[1] || String(color.fabric_id).padStart(3, '0');
      const colorIndex = colorsByFabric[color.fabric_id].length + 1;
      const colorNum = String(colorIndex).padStart(3, '0');
      
      colorsByFabric[color.fabric_id].push({
        color_id: color.color_id,
        fabric_id: color.fabric_id,
        id: `FAB-${fabricNum}-COL-${colorNum}`,
        color_name: color.color_name,
        created_at: color.created_at,
        updated_at: color.updated_at,
        // Roll attributes are now directly on the color
        total_meters: parseFloat(color.length_meters) || 0,
        total_yards: parseFloat(color.length_yards) || 0,
        length_meters: parseFloat(color.length_meters) || 0,
        length_yards: parseFloat(color.length_yards) || 0,
        initial_length_meters: color.initial_length_meters ? parseFloat(color.initial_length_meters) : null,
        initial_length_yards: color.initial_length_yards ? parseFloat(color.initial_length_yards) : null,
        date: color.date,
        weight: color.weight || 'N/A',
        lot: color.lot || null,
        roll_nb: color.roll_nb || null,
        roll_count: parseInt(color.roll_count) || 0,
        status: color.status || 'available',
        sold: Boolean(color.sold),
        created_by_username: color.created_by_username,
        created_by_full_name: color.created_by_full_name,
        updated_by_username: color.updated_by_username,
        updated_by_full_name: color.updated_by_full_name,
        // Include lots array for this color
        lots: lotsByColor[color.color_id] || []
      });
    });
    
    // Build final structure
    return fabrics.map(fabric => ({
      fabric_id: fabric.fabric_id,
      fabric_name: fabric.fabric_name,
      fabric_code: fabric.fabric_code,
      main_code: fabric.main_code,
      source: fabric.source,
      design: fabric.design,
      created_at: fabric.created_at,
      updated_at: fabric.updated_at,
      created_by_username: fabric.created_by_username,
      created_by_full_name: fabric.created_by_full_name,
      updated_by_username: fabric.updated_by_username,
      updated_by_full_name: fabric.updated_by_full_name,
      colors: colorsByFabric[fabric.fabric_id] || []
    }));
  } catch (error) {
    console.error('Error building fabric structure:', error);
    throw error;
  }
};

// Get single fabric by index (0-based array position)
const getFabricByIndex = async (index) => {
  const fabrics = await buildFabricColorAggregatedStructure();
  return fabrics[index] || null;
};

// Save complete fabric structure to database (INCREMENTAL - preserves existing data)
const saveFabricStructure = async (fabricsArray) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Get existing data for comparison
    const [existingFabrics] = await connection.query('SELECT fabric_id, fabric_code, main_code FROM fabrics');
    const [existingColors] = await connection.query('SELECT color_id, fabric_id, color_name FROM colors');
    const [existingRolls] = await connection.query(
      'SELECT roll_id, color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status, lot, roll_nb FROM rolls'
    );

    const existingFabricIds = new Set(existingFabrics.map(f => f.fabric_id));
    const existingFabricsByMainCode = new Map(existingFabrics.filter(f => f.main_code).map(f => [f.main_code, f.fabric_id]));
    const processedFabricIds = new Set();

    // Process each fabric
    for (const fabric of fabricsArray) {
      let fabricId = fabric.fabric_id;

      // Priority: fabric_id > main_code > insert new
      if (fabricId && existingFabricIds.has(fabricId)) {
        // UPDATE by fabric_id
        const userId = req.user ? req.user.user_id : null;
        await connection.query(
          'UPDATE fabrics SET fabric_name = ?, fabric_code = ?, main_code = ?, source = ?, design = ?, updated_by_user_id = ? WHERE fabric_id = ?',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code || null, fabric.source, fabric.design, userId, fabricId]
        );
        processedFabricIds.add(fabricId);
      } else if (fabric.main_code && existingFabricsByMainCode.has(fabric.main_code)) {
        // UPDATE by main_code if no fabric_id provided
        fabricId = existingFabricsByMainCode.get(fabric.main_code);
        const userId = req.user ? req.user.user_id : null;
        await connection.query(
          'UPDATE fabrics SET fabric_name = ?, fabric_code = ?, main_code = ?, source = ?, design = ?, updated_by_user_id = ? WHERE fabric_id = ?',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code, fabric.source, fabric.design, userId, fabricId]
        );
        processedFabricIds.add(fabricId);
      } else {
        // INSERT new fabric
        const userId = req.user ? req.user.user_id : null;
        const [result] = await connection.query(
          'INSERT INTO fabrics (fabric_name, fabric_code, main_code, source, design, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code || null, fabric.source, fabric.design, userId]
        );
        fabricId = result.insertId;
        processedFabricIds.add(fabricId);
      }

      // Process colors for this fabric
      const existingColorIds = new Set(
        existingColors.filter(c => c.fabric_id === fabricId).map(c => c.color_id)
      );
      const processedColorIds = new Set();

      for (const color of fabric.colors || []) {
        let colorId = color.color_id;

        if (colorId && existingColorIds.has(colorId)) {
          // UPDATE existing color
          const userId = req.user ? req.user.user_id : null;
          await connection.query(
            'UPDATE colors SET color_name = ?, updated_by_user_id = ? WHERE color_id = ?',
            [color.color_name, userId, colorId]
          );
          processedColorIds.add(colorId);
        } else {
          // INSERT new color
          const userId = req.user ? req.user.user_id : null;
          const [result] = await connection.query(
            'INSERT INTO colors (fabric_id, color_name, created_by_user_id) VALUES (?, ?, ?)',
            [fabricId, color.color_name, userId]
          );
          colorId = result.insertId;
          processedColorIds.add(colorId);
        }

        // Process rolls for this color
        const existingRollsForColor = existingRolls.filter(r => r.color_id === colorId);
        const existingRollIds = new Set(existingRollsForColor.map(r => r.roll_id));
        const processedRollIds = new Set();

        for (const roll of color.rolls || []) {
          // Prefer explicit DB roll_id when provided; otherwise fall back to position as before
          let targetRollId = roll.roll_id || roll.rollId;
          if (!targetRollId) {
            const rollIndex = color.rolls.indexOf(roll);
            const byIndex = existingRollsForColor[rollIndex];
            if (byIndex) targetRollId = byIndex.roll_id;
          }

          const rollPayload = {
            date: roll.date,
            length_meters: roll.length_meters,
            length_yards: roll.length_yards,
            is_trimmable: roll.is_trimmable ?? roll.isTrimmable ?? false,
            weight: roll.weight || 'N/A',
            status: roll.status || 'available',
            lot: roll.lot || null,
            roll_nb: roll.roll_nb || null
          };

          if (targetRollId && existingRollIds.has(targetRollId)) {
            await connection.query(
              'UPDATE rolls SET date = ?, length_meters = ?, length_yards = ?, is_trimmable = ?, weight = ?, status = ?, lot = ?, roll_nb = ? WHERE roll_id = ?',
              [rollPayload.date, rollPayload.length_meters, rollPayload.length_yards, rollPayload.is_trimmable, rollPayload.weight, rollPayload.status, rollPayload.lot || null, rollPayload.roll_nb || null, targetRollId]
            );
            processedRollIds.add(targetRollId);
          } else {
            const [result] = await connection.query(
              'INSERT INTO rolls (color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status, lot, roll_nb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [colorId, fabricId, rollPayload.date, rollPayload.length_meters, rollPayload.length_yards, rollPayload.is_trimmable, rollPayload.weight, rollPayload.status, rollPayload.lot || null, rollPayload.roll_nb || null]
            );
            processedRollIds.add(result.insertId);
          }
        }

        // DELETE rolls that were removed from this color
        const rollsToDelete = [...existingRollIds].filter(id => !processedRollIds.has(id));
        if (rollsToDelete.length > 0) {
          await connection.query('DELETE FROM rolls WHERE roll_id IN (?)', [rollsToDelete]);
        }
      }

      // DELETE colors that were removed from this fabric
      const colorsToDelete = [...existingColorIds].filter(id => !processedColorIds.has(id));
      if (colorsToDelete.length > 0) {
        // First delete all rolls in those colors
        await connection.query('DELETE FROM rolls WHERE color_id IN (?)', [colorsToDelete]);
        await connection.query('DELETE FROM colors WHERE color_id IN (?)', [colorsToDelete]);
      }
    }

    // DELETE fabrics that were completely removed
    const fabricsToDelete = [...existingFabricIds].filter(id => !processedFabricIds.has(id));
    if (fabricsToDelete.length > 0) {
      // Cascade delete: rolls -> colors -> fabrics
      await connection.query('DELETE FROM rolls WHERE fabric_id IN (?)', [fabricsToDelete]);
      await connection.query('DELETE FROM colors WHERE fabric_id IN (?)', [fabricsToDelete]);
      await connection.query('DELETE FROM fabrics WHERE fabric_id IN (?)', [fabricsToDelete]);
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error saving fabric structure:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Helper to get Lebanon-local date-only (no time). iso = YYYY-MM-DDT00:00:00, epoch = start of that day.
function getLebanonTimestamp(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('sv', {
    timeZone: 'Asia/Beirut',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatted = fmt.format(date);
  const iso = formatted + 'T00:00:00';
  const epoch = new Date(formatted + 'T00:00:00').getTime();
  return { iso, epoch, tz: 'Asia/Beirut' };
}

// Normalize client timestamp to date-only (YYYY-MM-DDT00:00:00). Accept YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.
function normalizeTimestampToDate(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const s = ts.trim();
  const datePart = s.split('T')[0].split(' ')[0] || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart + 'T00:00:00';
}

// Generate permit number automatically based on transaction type
// Separate counters for Type A and Type B, auto-incrementing from last transaction
async function generatePermitNumber(connection, transactionType) {
  try {
    // Validate transaction type
    if (!['A', 'B'].includes(transactionType)) {
      transactionType = 'A'; // Default to A if invalid
    }
    
    // Get last permit number for this transaction type
    // Extract numeric part from permit_number (e.g., "A-123" -> 123)
    // Only consider permit numbers that match the pattern: A-{number} or B-{number}
    const [result] = await connection.query(
      `SELECT MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) as last_num 
       FROM transaction_groups 
       WHERE transaction_type = ? 
       AND permit_number IS NOT NULL 
       AND permit_number REGEXP ?`,
      [transactionType, `^${transactionType}-[0-9]+$`]
    );
    
    const lastNum = result[0]?.last_num || 0;
    const nextNum = lastNum + 1;
    
    return `${transactionType}-${nextNum}`;
  } catch (error) {
    console.error('Error generating permit number:', error);
    // Fallback: use timestamp-based permit number if query fails
    const timestamp = Date.now();
    return `${transactionType}-${timestamp}`;
  }
}

// Helper to create or update transaction group
// Called within a database transaction, expects a connection
async function createOrUpdateTransactionGroup(connection, transactionGroupId, customerId, customerName, notes, amountMeters, transactionType = 'A', epoch = null, transactionDate = null) {
  if (!transactionGroupId) return;
  
  const now = getLebanonTimestamp();
  const transactionEpoch = epoch || now.epoch;
  
  // Use provided transaction_date if available, otherwise use current timestamp
  // Convert now.iso from YYYY-MM-DDT00:00:00 to YYYY-MM-DD HH:MM:SS format for MySQL
  let transactionDateValue = now.iso.replace('T', ' ');
  let transactionTimezone = now.tz;
  
  if (transactionDate) {
    // If transaction_date is provided, use it and convert to proper format
    // transactionDate should be in YYYY-MM-DD format
    if (typeof transactionDate === 'string' && transactionDate.trim()) {
      // Ensure it's a valid date string
      const dateStr = transactionDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Convert to datetime format (YYYY-MM-DD HH:MM:SS) using midnight
        transactionDateValue = `${dateStr} 00:00:00`;
        // Use the epoch if provided, otherwise calculate from the date
        if (!epoch) {
          transactionEpoch = new Date(dateStr + 'T00:00:00').getTime();
        }
      }
    }
  }
  
  // Check if transaction group already exists
  const [existing] = await connection.query(
    'SELECT transaction_group_id, total_items, total_meters, notes, permit_number, transaction_type, epoch FROM transaction_groups WHERE transaction_group_id = ?',
    [transactionGroupId]
  );
  
  if (existing.length === 0) {
    // Create new transaction group - auto-generate permit number
    // Generate permit number based on transaction type (separate counters for A and B)
    let permitNumber = await generatePermitNumber(connection, transactionType);
    
    // Retry logic in case of duplicate permit number (race condition)
    let retries = 3;
    let inserted = false;
    while (retries > 0 && !inserted) {
      try {
        await connection.query(
          'INSERT INTO transaction_groups (transaction_group_id, permit_number, transaction_type, customer_id, customer_name, transaction_date, epoch, timezone, total_items, total_meters, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
          [transactionGroupId, permitNumber, transactionType, customerId || null, customerName || null, transactionDateValue, transactionEpoch, transactionTimezone, amountMeters, notes || null]
        );
        inserted = true; // Success, exit retry loop
      } catch (error) {
        // If duplicate permit number error, regenerate and retry
        if (error.code === 'ER_DUP_ENTRY' || error.message.includes('Duplicate entry')) {
          retries--;
          if (retries > 0) {
            // Regenerate permit number and retry
            permitNumber = await generatePermitNumber(connection, transactionType);
            continue;
          }
        }
        // Re-throw if not a duplicate error or out of retries
        throw error;
      }
    }
  } else {
    // Update existing transaction group - increment items and add to total meters
    const current = existing[0];
    // Preserve existing notes if new notes are null/empty, otherwise use new notes
    const finalNotes = (notes && notes.trim()) ? notes : (current.notes || null);
    await connection.query(
      'UPDATE transaction_groups SET total_items = ?, total_meters = ?, notes = ? WHERE transaction_group_id = ?',
      [current.total_items + 1, parseFloat(current.total_meters) + amountMeters, finalNotes, transactionGroupId]
    );
  }
}

// Map customer row to API shape
const mapCustomer = (row) => ({
  id: row.customer_id,
  name: row.customer_name,
  phone: row.phone || null,
  email: row.email || null,
  notes: row.notes || null,
  created_at: row.created_at,
  updated_at: row.updated_at
});

// ============================================
// AUTHENTICATION ENDPOINTS (Public)
// ============================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    const identifier = username || email;
    if (!identifier) {
      return res.status(400).json({ error: 'Username or email is required' });
    }

    // Find user by username or email
    const [users] = await db.query(
      'SELECT user_id, username, email, password_hash, role, full_name FROM users WHERE username = ? OR email = ?',
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user info (without password hash) and token
    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    
    // Check for database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Database connection failed',
        message: 'Unable to connect to database. Please check database configuration.'
      });
    }
    
    // Check for authentication errors (wrong password, etc.)
    if (error.message && error.message.includes('password')) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generic error - include message in development for debugging
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.status(500).json({ 
      error: 'Failed to login',
      ...(isDevelopment && { detail: error.message, stack: error.stack })
    });
  }
});

// POST /api/auth/register (admin only - but allow first user to be admin)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'limited', full_name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if this is the first user (allow them to be admin)
    const [existingUsers] = await db.query('SELECT COUNT(*) as count FROM users');
    const isFirstUser = existingUsers[0].count === 0;
    const finalRole = isFirstUser ? 'admin' : role;

    // If not first user, require admin role to create other admins
    if (!isFirstUser && role === 'admin') {
      // Check if requester is admin (from token)
      const token = extractToken(req);
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const [adminCheck] = await db.query('SELECT role FROM users WHERE user_id = ?', [decoded.userId]);
          if (adminCheck.length === 0 || adminCheck[0].role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can create admin accounts' });
          }
        } catch (err) {
          return res.status(403).json({ error: 'Only admins can create admin accounts' });
        }
      } else {
        return res.status(403).json({ error: 'Only admins can create admin accounts' });
      }
    }

    // Check if username or email already exists
    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, role, full_name) VALUES (?, ?, ?, ?, ?)',
      [username, email, passwordHash, finalRole, full_name || null]
    );

    const [newUser] = await db.query(
      'SELECT user_id, username, email, role, full_name FROM users WHERE user_id = ?',
      [result.insertId]
    );

    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// GET /api/auth/me - Get current user info
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      user_id: req.user.user_id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      full_name: req.user.full_name
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ============================================
// USER MANAGEMENT ENDPOINTS (Admin Only)
// ============================================

// GET /api/users - List all users (admin only)
app.get('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT user_id, username, email, role, full_name, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/users/:id - Update user (admin only)
app.put('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, email, role, full_name, password } = req.body;

    // Don't allow changing your own role (security)
    if (req.user.user_id === userId && role && role !== req.user.role) {
      return res.status(403).json({ error: 'Cannot change your own role' });
    }

    const updates = [];
    const values = [];

    if (username) {
      // Check if username is taken by another user
      const [existing] = await db.query('SELECT user_id FROM users WHERE username = ? AND user_id != ?', [username, userId]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      updates.push('username = ?');
      values.push(username);
    }

    if (email) {
      // Check if email is taken by another user
      const [existing] = await db.query('SELECT user_id FROM users WHERE email = ? AND user_id != ?', [email, userId]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Email already taken' });
      }
      updates.push('email = ?');
      values.push(email);
    }

    if (role && ['admin', 'limited'].includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name || null);
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Get old record before update
    const [oldUserRows] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (oldUserRows.length === 0) return res.status(404).json({ error: 'User not found' });
    const oldUserRecord = oldUserRows[0];

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
    await db.query(sql, values);

    const [updated] = await db.query(
      'SELECT user_id, username, email, role, full_name, created_at, updated_at FROM users WHERE user_id = ?',
      [userId]
    );

    // Get updated record for audit
    const [newUserRows] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    await logUpdate('users', userId, req.user, oldUserRecord, newUserRows[0], req, `Updated user: ${newUserRows[0].username || oldUserRecord.username}`);

    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Delete user (admin only)
app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Don't allow deleting yourself
    if (req.user.user_id === userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    // Get record before deletion
    const [oldUserRows] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (oldUserRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const oldUserRecord = oldUserRows[0];

    await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
    
    // Log audit entry
    await logDelete('users', userId, req.user, oldUserRecord, req, `Deleted user: ${oldUserRecord.username}`);
    
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// DELETION REQUESTS ENDPOINTS
// ============================================

// POST /api/deletion-requests - Create deletion request (limited users)
app.post('/api/deletion-requests', authMiddleware, async (req, res) => {
  try {
    const { request_type, target_id, target_name, reason } = req.body;

    if (!request_type || !target_id) {
      return res.status(400).json({ error: 'Request type and target ID are required' });
    }

    const validTypes = ['delete_fabric', 'delete_color', 'delete_roll', 'cancel_transaction'];
    if (!validTypes.includes(request_type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    // Limited users can create requests, admins can too (but usually don't need to)
    await db.query(
      'INSERT INTO deletion_requests (requested_by_user_id, request_type, target_id, target_name, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.user_id, request_type, target_id, target_name || null, reason || null, 'pending']
    );

    res.status(201).json({ success: true, message: 'Deletion request created' });
  } catch (error) {
    console.error('Error creating deletion request:', error);
    res.status(500).json({ error: 'Failed to create deletion request' });
  }
});

// GET /api/deletion-requests - Get deletion requests (admin sees all, limited users see their own)
app.get('/api/deletion-requests', authMiddleware, async (req, res) => {
  try {
    // Check if table exists
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'deletion_requests'
    `);
    
    if (tables.length === 0) {
      return res.status(200).json([]); // Return empty array if table doesn't exist
    }

    let sql = `
      SELECT 
        dr.*,
        u.username as requested_by_username,
        u.full_name as requested_by_name,
        reviewer.username as reviewed_by_username
      FROM deletion_requests dr
      JOIN users u ON dr.requested_by_user_id = u.user_id
      LEFT JOIN users reviewer ON dr.reviewed_by_user_id = reviewer.user_id
    `;
    const params = [];

    // Limited users only see their own requests
    if (req.user.role !== 'admin') {
      sql += ' WHERE dr.requested_by_user_id = ?';
      params.push(req.user.user_id);
    }

    sql += ' ORDER BY dr.created_at DESC';

    const [requests] = await db.query(sql, params);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching deletion requests:', error);
    console.error('Error details:', error.message, error.code, error.sqlMessage);
    // Return empty array instead of error to prevent frontend crashes
    res.status(200).json([]);
  }
});

// PUT /api/deletion-requests/:id/approve - Approve deletion request (admin only)
app.put('/api/deletion-requests/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);

    // Get the request
    const [requests] = await db.query('SELECT * FROM deletion_requests WHERE request_id = ?', [requestId]);
    if (requests.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const deletionRequest = requests[0];
    if (deletionRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    // Mark as approved
    await db.query(
      'UPDATE deletion_requests SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE request_id = ?',
      ['approved', req.user.user_id, requestId]
    );

    // Execute the deletion based on request type
    // Note: The actual deletion logic will be handled by existing endpoints
    // This just marks the request as approved - the admin will still need to perform the actual deletion
    // OR you can implement the deletion here directly

    res.json({ success: true, message: 'Request approved' });
  } catch (error) {
    console.error('Error approving deletion request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PUT /api/deletion-requests/:id/reject - Reject deletion request (admin only)
app.put('/api/deletion-requests/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);

    await db.query(
      'UPDATE deletion_requests SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE request_id = ?',
      ['rejected', req.user.user_id, requestId]
    );

    res.json({ success: true, message: 'Request rejected' });
  } catch (error) {
    console.error('Error rejecting deletion request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ============================================
// CUSTOMERS ENDPOINTS
// ============================================

app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let sql = `SELECT c.*,
      u_created.username as created_by_username, u_created.full_name as created_by_full_name,
      u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM customers c
      LEFT JOIN users u_created ON c.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON c.updated_by_user_id = u_updated.user_id`;
    const params = [];
    if (search) {
      sql += ' WHERE customer_name LIKE ?';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY customer_name ASC LIMIT 100';
    const [rows] = await db.query(sql, params);
    res.json(rows.map(mapCustomer));
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.get('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomer(rows[0]));
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

app.post('/api/customers', authMiddleware, async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const userId = req.user ? req.user.user_id : null;
    const [result] = await db.query(
      'INSERT INTO customers (customer_name, phone, email, notes, created_by_user_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), phone || null, email || null, notes || null, userId]
    );
    const [rows] = await db.query(`
      SELECT c.*,
        u_created.username as created_by_username, u_created.full_name as created_by_full_name,
        u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM customers c
      LEFT JOIN users u_created ON c.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON c.updated_by_user_id = u_updated.user_id
      WHERE c.customer_id = ?
    `, [result.insertId]);
    
    // Log audit entry
    await logInsert('customers', result.insertId, req.user, rows[0], req, `Created customer: ${name.trim()}`);
    
    res.status(201).json(mapCustomer(rows[0]));
  } catch (error) {
    console.error('Error creating customer:', error.message, error.code);
    res.status(500).json({ error: error.message || 'Failed to create customer' });
  }
});

app.put('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.customer_name = name?.trim() || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (email !== undefined) updates.email = email || null;
    if (notes !== undefined) updates.notes = notes || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Get old record before update
    const [oldCustomerRows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (oldCustomerRows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const oldCustomerRecord = oldCustomerRows[0];

    const userId = req.user ? req.user.user_id : null;
    updates.updated_by_user_id = userId;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id];
    await db.query(`UPDATE customers SET ${fields} WHERE customer_id = ?`, values);

    const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    
    // Log audit entry
    await logUpdate('customers', parseInt(req.params.id), req.user, oldCustomerRecord, rows[0], req, `Updated customer: ${rows[0].customer_name || oldCustomerRecord.customer_name}`);
    
    res.json(mapCustomer(rows[0]));
  } catch (error) {
    console.error('Error updating customer:', error.message, error.code);
    res.status(500).json({ error: error.message || 'Failed to update customer' });
  }
});

// GET /api/customers/:id/transaction-count - Get transaction count for a customer
app.get('/api/customers/:id/transaction-count', authMiddleware, async (req, res) => {
  try {
    const [logs] = await db.query('SELECT COUNT(*) as count FROM logs WHERE customer_id = ?', [req.params.id]);
    res.json({ count: logs[0].count || 0 });
  } catch (error) {
    console.error('Error getting transaction count:', error);
    res.status(500).json({ error: 'Failed to get transaction count' });
  }
});

app.delete('/api/customers/:id', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // Check if customer has associated logs/transaction groups
    // Get customer record before deletion
    const [customerRows] = await connection.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (customerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customerRecord = customerRows[0];

    const [logs] = await connection.query('SELECT COUNT(*) as count FROM logs WHERE customer_id = ?', [req.params.id]);
    const [groups] = await connection.query('SELECT COUNT(*) as count FROM transaction_groups WHERE customer_id = ?', [req.params.id]);
    const transactionCount = (logs[0]?.count || 0) + (groups[0]?.count || 0);
    
    // Delete customer - this will set customer_id to NULL in logs due to ON DELETE SET NULL constraint
    const [result] = await connection.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    
    // Log audit entry
    await logDelete('customers', parseInt(req.params.id), req.user, customerRecord, req, `Deleted customer: ${customerRecord.customer_name} (had ${transactionCount} transactions)`);

    await connection.commit();
    
    res.json({ 
      success: true,
      message: transactionCount > 0 
        ? `Customer deleted. ${transactionCount} transaction(s) have been updated to remove customer association.`
        : 'Customer deleted successfully.'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting customer:', error.message, error.code);
    res.status(500).json({ error: error.message || 'Failed to delete customer' });
  } finally {
    connection.release();
  }
});

// ============================================
// FABRICS ENDPOINTS (ID-based, not index-based)
// ============================================

// GET all fabrics (now returns aggregated fabric+color structure)
app.get('/api/fabrics', authMiddleware, async (req, res) => {
  try {
    // Use aggregated structure for fabric+color-based system
    const fabrics = await buildFabricColorAggregatedStructure();
    res.json(fabrics);
  } catch (error) {
    console.error('Error fetching fabrics:', error);
    res.status(500).json({ error: 'Failed to fetch fabrics' });
  }
});

// GET single fabric by fabric_id (DB ID, not array index)
app.get('/api/fabrics/:fabric_id', authMiddleware, async (req, res) => {
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const [rows] = await db.query('SELECT * FROM fabrics WHERE fabric_id = ?', [fabricId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Fabric not found' });
    }

    // Build aggregated structure for this fabric
    const fabrics = await buildFabricColorAggregatedStructure();
    const fabric = fabrics.find(f => f.fabric_id === fabricId);
    
    res.json(fabric);
  } catch (error) {
    console.error('Error fetching fabric:', error);
    res.status(500).json({ error: 'Failed to fetch fabric' });
  }
});

// POST create new fabric
app.post('/api/fabrics', authMiddleware, async (req, res) => {
  try {
    const { fabric_name, fabric_code, main_code, source, design } = req.body;
    
    // Validation
    if (!fabric_name || !fabric_name.trim()) {
      return res.status(400).json({ error: 'Fabric name is required' });
    }
    if (!fabric_code) {
      return res.status(400).json({ error: 'Fabric code is required' });
    }

    // Check for duplicate fabric_code
    const [existing] = await db.query('SELECT fabric_id FROM fabrics WHERE fabric_code = ?', [fabric_code]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Fabric code already exists' });
    }

    // Insert and return DB reality
    const userId = req.user ? req.user.user_id : null;
    const [result] = await db.query(
      'INSERT INTO fabrics (fabric_name, fabric_code, main_code, source, design, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [fabric_name.trim(), fabric_code, main_code || null, source || null, design || 'none', userId]
    );

    // Get created fabric for audit
    const [newFabricRows] = await db.query('SELECT * FROM fabrics WHERE fabric_id = ?', [result.insertId]);
    await logInsert('fabrics', result.insertId, req.user, newFabricRows[0], req, `Created fabric: ${fabric_name.trim()}`);

    // Return aggregated structure for created fabric
    const fabrics = await buildFabricColorAggregatedStructure();
    const created = fabrics.find(f => f.fabric_id === result.insertId);
    
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating fabric:', error);
    res.status(500).json({ error: 'Failed to create fabric' });
  }
});

// PUT update single fabric by fabric_id
app.put('/api/fabrics/:fabric_id', authMiddleware, async (req, res) => {
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const { fabric_name, fabric_code, main_code, source, design } = req.body;

    // Check fabric exists
    const [existing] = await db.query('SELECT fabric_id FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Fabric not found' });
    }

    // Check for duplicate fabric_code (excluding current fabric)
    if (fabric_code) {
      const [duplicate] = await db.query(
        'SELECT fabric_id FROM fabrics WHERE fabric_code = ? AND fabric_id != ?',
        [fabric_code, fabricId]
      );
      if (duplicate.length > 0) {
        return res.status(409).json({ error: 'Fabric code already exists' });
      }
    }

    // Build update query dynamically
    const updates = {};
    if (fabric_name !== undefined) updates.fabric_name = fabric_name.trim();
    if (fabric_code !== undefined) updates.fabric_code = fabric_code;
    if (main_code !== undefined) updates.main_code = main_code || null;
    if (source !== undefined) updates.source = source || null;
    if (design !== undefined) updates.design = design || 'none';

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Get old record before update
    const [oldFabricRows] = await db.query('SELECT * FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (oldFabricRows.length === 0) return res.status(404).json({ error: 'Fabric not found' });
    const oldFabricRecord = oldFabricRows[0];

    const userId = req.user ? req.user.user_id : null;
    updates.updated_by_user_id = userId;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), fabricId];
    
    await db.query(`UPDATE fabrics SET ${fields} WHERE fabric_id = ?`, values);

    // Get updated record for audit
    const [newFabricRows] = await db.query('SELECT * FROM fabrics WHERE fabric_id = ?', [fabricId]);
    await logUpdate('fabrics', fabricId, req.user, oldFabricRecord, newFabricRows[0], req, `Updated fabric: ${newFabricRows[0].fabric_name}`);

    // Return aggregated structure after update
    const fabrics = await buildFabricColorAggregatedStructure();
    const updated = fabrics.find(f => f.fabric_id === fabricId);
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating fabric:', error);
    res.status(500).json({ error: 'Failed to update fabric' });
  }
});

// DELETE fabric by fabric_id with cascade (PRESERVES LOGS)
app.delete('/api/fabrics/:fabric_id', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const fabricId = parseInt(req.params.fabric_id);
    
    await connection.beginTransaction();

    // Check if fabric exists
    const [existing] = await connection.query('SELECT fabric_id FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric not found' });
    }

    // Get fabric record before deletion
    const [fabricRows] = await connection.query('SELECT * FROM fabrics WHERE fabric_id = ?', [fabricId]);
    const fabricRecord = fabricRows[0];
    
    // IMPORTANT: Do NOT delete logs - they are append-only audit records
    // Logs will have fabric_id set to NULL via ON DELETE SET NULL constraint
    // Cascade delete: colors -> fabric (logs preserved, rolls table removed)
    await connection.query('DELETE FROM colors WHERE fabric_id = ?', [fabricId]);
    await connection.query('DELETE FROM fabrics WHERE fabric_id = ?', [fabricId]);

    // Log audit entry
    await logDelete('fabrics', fabricId, req.user, fabricRecord, req, `Deleted fabric: ${fabricRecord.fabric_name}`);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting fabric:', error);
    res.status(500).json({ error: 'Failed to delete fabric' });
  } finally {
    connection.release();
  }
});

// DELETE color by color_id with cascade to rolls
app.delete('/api/colors/:color_id', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    
    await connection.beginTransaction();

    // Check if color exists and get record before deletion
    const [existing] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    const colorRecord = existing[0];

    // Cascade delete: color (rolls table removed, attributes are now on colors)
    await connection.query('DELETE FROM colors WHERE color_id = ?', [colorId]);

    // Log audit entry
    await logDelete('colors', colorId, req.user, colorRecord, req, `Deleted color: ${colorRecord.color_name}`);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting color:', error);
    res.status(500).json({ error: 'Failed to delete color' });
  } finally {
    connection.release();
  }
});

// ============================================
// DEPRECATED ROLL ENDPOINTS - NO LONGER USED
// Rolls have been removed, colors now have roll attributes directly
// These endpoints are kept for reference but should not be called
// ============================================

// DELETE roll by roll_id - DEPRECATED: Use color endpoints instead
/* app.delete('/api/rolls/:roll_id', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    
    await connection.beginTransaction();

    // Check if roll exists
    const [existing] = await connection.query('SELECT roll_id FROM rolls WHERE roll_id = ?', [rollId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Roll not found' });
    }

    // Delete the roll
    await connection.query('DELETE FROM rolls WHERE roll_id = ?', [rollId]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting roll:', error);
    res.status(500).json({ error: 'Failed to delete roll' });
  } finally {
    connection.release();
  }
}); */

// PUT bulk update - DEPRECATED: Use granular endpoints instead
// Kept for backward compatibility but should be phased out
// Requires admin role since it can delete colors
app.put('/api/fabrics', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    console.warn('PUT /api/fabrics: Bulk save endpoint is deprecated. Use granular endpoints instead.');
    
    let fabricsArray = req.body;

    // Accept single-object payloads by wrapping into an array
    if (!Array.isArray(fabricsArray)) {
      console.warn('PUT /api/fabrics: received non-array payload; wrapping into array');
      fabricsArray = [fabricsArray];
    }
    if (!Array.isArray(fabricsArray) || fabricsArray.length === 0) {
      console.warn('PUT /api/fabrics: validation failed - empty or invalid array');
      return res.status(400).json({ error: 'Request body must be a non-empty array of fabrics' });
    }

    // Validate fabrics have either fabric_id or main_code for matching
    for (const fabric of fabricsArray) {
      if (!fabric.fabric_id && !fabric.main_code) {
        console.warn('PUT /api/fabrics: validation failed - fabric_id and main_code both missing on fabric:', fabric);
        return res.status(400).json({ error: 'Each fabric must have fabric_id or main_code for matching' });
      }
    }

    await saveFabricStructure(fabricsArray);
    
    // Return aggregated structure
    const updated = await buildFabricColorAggregatedStructure();
    res.json(updated);
  } catch (error) {
    console.error('PUT /api/fabrics error:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to update fabrics' });
  }
});

// ============================================
// GRANULAR ENDPOINTS FOR CONCURRENCY SAFETY
// ============================================

// POST /api/fabrics/:fabric_id/colors - Add color to fabric
app.post('/api/fabrics/:fabric_id/colors', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const { 
      color_name, 
      length_meters, 
      length_yards, 
      date, 
      weight, 
      lot, 
      roll_nb,
      roll_count,
      lots  // Array of lots: [{ lot_number, length_meters, length_yards, date, weight, roll_nb }]
    } = req.body;

    if (!color_name || !color_name.trim()) {
      return res.status(400).json({ error: 'Color name is required' });
    }

    await connection.beginTransaction();

    // Check fabric exists
    const [fabric] = await connection.query('SELECT fabric_id FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (fabric.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric not found' });
    }

    // Parse roll attributes (default to 0 if not provided)
    const lenM = parseFloat(length_meters) || 0;
    const lenY = parseFloat(length_yards) || 0;
    const rollDate = date ? String(date).trim() : new Date().toISOString().split('T')[0];
    
    // Check for duplicate color name with same date (enforced by unique constraint)
    // Note: NULL dates are treated as distinct by MySQL, so multiple NULL dates are allowed
    const [existing] = await connection.query(
      'SELECT color_id FROM colors WHERE fabric_id = ? AND color_name = ? AND date = ?',
      [fabricId, color_name.trim(), rollDate]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Color name already exists for this fabric on this date' });
    }
    const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : null;
    const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;

    // Validate lots if provided
    if (lots && Array.isArray(lots) && lots.length > 0) {
      // Calculate sum of lot lengths
      let sumMeters = 0;
      let sumYards = 0;
      const lotNumbers = new Set();
      
      for (const lotItem of lots) {
        if (!lotItem.lot_number || !lotItem.lot_number.trim()) {
          await connection.rollback();
          return res.status(400).json({ error: 'Each lot must have a lot_number' });
        }
        
        // Check for duplicate lot numbers
        const lotNum = lotItem.lot_number.trim();
        if (lotNumbers.has(lotNum)) {
          await connection.rollback();
          return res.status(400).json({ error: `Duplicate lot number: ${lotNum}` });
        }
        lotNumbers.add(lotNum);
        
        const lotM = parseFloat(lotItem.length_meters) || 0;
        const lotY = parseFloat(lotItem.length_yards) || 0;
        
        if (lotM < 0 || lotY < 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Lot lengths must be non-negative' });
        }
        
        sumMeters += lotM;
        sumYards += lotY;
      }
      
      // Validate that sum equals total (allow small floating point differences)
      const tolerance = 0.01;
      if (Math.abs(sumMeters - lenM) > tolerance || Math.abs(sumYards - lenY) > tolerance) {
        await connection.rollback();
        return res.status(400).json({ 
          error: `Sum of lot lengths (${sumMeters}m, ${sumYards}yd) must equal total length (${lenM}m, ${lenY}yd)` 
        });
      }
    }

    // Insert color with roll attributes
    const rollCountValue = parseInt(roll_count) || 0;
    // Set initial length if this is the first length (non-zero)
    const initialLenM = (lenM > 0) ? lenM : null;
    const initialLenY = (lenY > 0) ? lenY : null;
    const userId = req.user ? req.user.user_id : null;
    const [result] = await connection.query(
      'INSERT INTO colors (fabric_id, color_name, length_meters, length_yards, initial_length_meters, initial_length_yards, date, weight, lot, roll_nb, roll_count, status, sold, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        fabricId, 
        color_name.trim(), 
        lenM, 
        lenY,
        initialLenM,
        initialLenY,
        rollDate, 
        weight || 'N/A', 
        lotValue, 
        rollNbValue,
        rollCountValue,
        'available',
        0,
        userId
      ]
    );

    const colorId = result.insertId;

    // Get created color for audit
    const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    await logInsert('colors', colorId, req.user, newColorRows[0], req, `Created color: ${color_name.trim()} (${lenY}yd/${lenM}m)`);

    // Insert lots if provided
    if (lots && Array.isArray(lots) && lots.length > 0) {
      for (const lotItem of lots) {
        const lotM = parseFloat(lotItem.length_meters) || 0;
        const lotY = parseFloat(lotItem.length_yards) || 0;
        const lotDate = lotItem.date ? String(lotItem.date).trim() : rollDate;
        const lotWeight = (lotItem.weight && typeof lotItem.weight === 'string' && lotItem.weight.trim() !== '') 
          ? lotItem.weight.trim() : null;
        const lotRollNb = (lotItem.roll_nb && typeof lotItem.roll_nb === 'string' && lotItem.roll_nb.trim() !== '') 
          ? lotItem.roll_nb.trim() : null;
        
        // Set initial length when creating lot (first non-zero length)
        const initialLotM = (lotM > 0) ? lotM : null;
        const initialLotY = (lotY > 0) ? lotY : null;
        
        const userId = req.user ? req.user.user_id : null;
        await connection.query(
          'INSERT INTO color_lots (color_id, lot_number, length_meters, length_yards, initial_length_meters, initial_length_yards, date, weight, roll_nb, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [colorId, lotItem.lot_number.trim(), lotM, lotY, initialLotM, initialLotY, lotDate, lotWeight, lotRollNb, userId]
        );
      }
    }

    await connection.commit();

    // Return aggregated fabric structure with new color
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after creation' });
    }

    res.status(201).json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating color:', error);
    res.status(500).json({ error: error.message || 'Failed to create color' });
  } finally {
    connection.release();
  }
});

// PUT /api/colors/:color_id - Update color (name and roll attributes)
app.put('/api/colors/:color_id', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const { 
      color_name,
      length_meters,
      length_yards,
      date,
      weight,
      lot,
      roll_nb,
      roll_count,
      status,
      initial_length_meters,  // Admin only (or with update_initial_to_match)
      initial_length_yards,   // Admin only (or with update_initial_to_match)
      update_initial_to_match // When setting length: allow any user to set initial = length
    } = req.body;

    await connection.beginTransaction();

    // Check color exists and get fabric_id, length, initial_length
    const [colors] = await connection.query(
      'SELECT color_id, fabric_id, length_meters, length_yards, initial_length_meters, initial_length_yards FROM colors WHERE color_id = ?',
      [colorId]
    );
    if (colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    const fabricId = colors[0].fabric_id;
    const currentLenM = parseFloat(colors[0].length_meters) || 0;
    const currentLenY = parseFloat(colors[0].length_yards) || 0;
    const currentInitialMeters = colors[0].initial_length_meters != null ? parseFloat(colors[0].initial_length_meters) : null;
    const currentInitialYards = colors[0].initial_length_yards != null ? parseFloat(colors[0].initial_length_yards) : null;

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (color_name !== undefined) {
      if (!color_name || !color_name.trim()) {
        await connection.rollback();
        return res.status(400).json({ error: 'Color name cannot be empty' });
      }
      // Get current date to check for duplicates
      const [currentColor] = await connection.query(
        'SELECT date FROM colors WHERE color_id = ?',
        [colorId]
      );
      const currentDate = currentColor[0]?.date || null;
      
      // Check for duplicate color name with same date (excluding current color)
      // If date is being updated, check against new date; otherwise check against current date
      const checkDate = date !== undefined ? (date ? String(date).trim() : null) : currentDate;
      const [existing] = await connection.query(
        'SELECT color_id FROM colors WHERE fabric_id = ? AND color_name = ? AND date = ? AND color_id != ?',
        [fabricId, color_name.trim(), checkDate, colorId]
      );
      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'Color name already exists for this fabric on this date' });
      }
      updates.push('color_name = ?');
      values.push(color_name.trim());
    }

    let newLenM = currentLenM;
    let newLenY = currentLenY;
    let newInitM = currentInitialMeters;
    let newInitY = currentInitialYards;

    if (length_meters !== undefined) {
      const lenM = parseFloat(length_meters);
      if (isNaN(lenM) || lenM < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid length_meters' });
      }
      updates.push('length_meters = ?');
      values.push(lenM);
      newLenM = lenM;
      if (!currentInitialMeters && lenM > 0) {
        updates.push('initial_length_meters = ?');
        values.push(lenM);
        newInitM = lenM;
      }
    }

    if (length_yards !== undefined) {
      const lenY = parseFloat(length_yards);
      if (isNaN(lenY) || lenY < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid length_yards' });
      }
      updates.push('length_yards = ?');
      values.push(lenY);
      newLenY = lenY;
      if (!currentInitialYards && lenY > 0) {
        updates.push('initial_length_yards = ?');
        values.push(lenY);
        newInitY = lenY;
      }
    }

    if (date !== undefined) {
      const rollDate = date ? String(date).trim() : null;
      updates.push('date = ?');
      values.push(rollDate);
    }

    if (weight !== undefined) {
      updates.push('weight = ?');
      values.push(weight || 'N/A');
    }

    if (lot !== undefined) {
      const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : null;
      updates.push('lot = ?');
      values.push(lotValue);
    }

    if (roll_nb !== undefined) {
      const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;
      updates.push('roll_nb = ?');
      values.push(rollNbValue);
    }

    if (roll_count !== undefined) {
      const rollCountValue = parseInt(roll_count) || 0;
      updates.push('roll_count = ?');
      values.push(rollCountValue);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    // update_initial_to_match: when setting length, allow any user to set initial = new length.
    const doUpdateInitialToMatch = update_initial_to_match === true || update_initial_to_match === 'true';
    if (doUpdateInitialToMatch && (length_meters !== undefined || length_yards !== undefined)) {
      const initM = length_meters !== undefined ? parseFloat(length_meters) : newLenM;
      const initY = length_yards !== undefined ? parseFloat(length_yards) : newLenY;
      if (!isNaN(initM) && initM >= 0) {
        updates.push('initial_length_meters = ?');
        values.push(initM);
        newInitM = initM;
      }
      if (!isNaN(initY) && initY >= 0) {
        updates.push('initial_length_yards = ?');
        values.push(initY);
        newInitY = initY;
      }
    }
    // Allow admins to update initial_length explicitly (admin only). Constraint: initial >= current length.
    else if (initial_length_meters !== undefined || initial_length_yards !== undefined) {
      if (req.user.role !== 'admin') {
        await connection.rollback();
        return res.status(403).json({ error: 'Only admins can update initial length' });
      }
      if (initial_length_meters !== undefined) {
        const initM = parseFloat(initial_length_meters);
        if (isNaN(initM) || initM < 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Invalid initial_length_meters' });
        }
        updates.push('initial_length_meters = ?');
        values.push(initM);
        newInitM = initM;
      }
      if (initial_length_yards !== undefined) {
        const initY = parseFloat(initial_length_yards);
        if (isNaN(initY) || initY < 0) {
          await connection.rollback();
          return res.status(400).json({ error: 'Invalid initial_length_yards' });
        }
        updates.push('initial_length_yards = ?');
        values.push(initY);
        newInitY = initY;
      }
    }

    // Enforce: current length cannot exceed initial. Use effective new length/initial.
    const effInitM = newInitM != null ? newInitM : null;
    const effInitY = newInitY != null ? newInitY : null;
    if (effInitM != null && newLenM > effInitM) {
      await connection.rollback();
      return res.status(400).json({ error: 'Current length (meters) cannot exceed initial length. Please increase initial or reduce current.' });
    }
    if (effInitY != null && newLenY > effInitY) {
      await connection.rollback();
      return res.status(400).json({ error: 'Current length (yards) cannot exceed initial length. Please increase initial or reduce current.' });
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No fields to update' });
    }

    const userId = req.user ? req.user.user_id : null;
    updates.push('updated_by_user_id = ?');
    values.push(userId);
    values.push(colorId);

    // Get full old record for audit
    const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const oldColorRecord = oldColorRows[0];

    // Update color with roll attributes
    await connection.query(
      `UPDATE colors SET ${updates.join(', ')} WHERE color_id = ?`,
      values
    );

    // Get updated record for audit
    const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const newColorRecord = newColorRows[0];

    // Log audit entry - especially important for length updates
    await logUpdate('colors', colorId, req.user, oldColorRecord, newColorRecord, req, `Updated color: ${newColorRecord.color_name || oldColorRecord.color_name}`);

    await connection.commit();

    // Return aggregated fabric structure with updated color
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after color update' });
    }

    res.json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating color:', error);
    res.status(500).json({ error: error.message || 'Failed to update color' });
  } finally {
    connection.release();
  }
});

// Shared handler: Add meters/yards to color. Only updates current length by default.
// Pass update_initial_to_match: true to also set initial = new current (when user confirms in UI).
async function addMetersToColorHandler(req, res) {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const { date, length_meters, length_yards, is_trimmable, weight, lot, roll_nb, update_initial_to_match } = req.body;

    const lenM = parseFloat(length_meters);
    const lenY = parseFloat(length_yards);
    if (isNaN(lenM) || lenM < 0 || isNaN(lenY) || lenY < 0) {
      return res.status(400).json({ error: 'Valid length in meters and yards is required' });
    }

    await connection.beginTransaction();

    const [colors] = await connection.query(
      'SELECT color_id, fabric_id, length_meters, length_yards, initial_length_meters, initial_length_yards FROM colors WHERE color_id = ? FOR UPDATE',
      [colorId]
    );
    if (colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    const fabricId = colors[0].fabric_id;
    const currentMeters = parseFloat(colors[0].length_meters) || 0;
    const currentYards = parseFloat(colors[0].length_yards) || 0;

    let rollDate = date;
    if (rollDate != null && rollDate !== undefined) {
      rollDate = rollDate instanceof Date ? rollDate.toISOString().split('T')[0] : String(rollDate).trim();
    } else {
      rollDate = '';
    }
    if (!rollDate || rollDate === '' || rollDate === 'Invalid Date' || rollDate === 'null' || rollDate === 'undefined' || rollDate === 'NaN' || !/^\d{4}-\d{2}-\d{2}$/.test(rollDate)) {
      rollDate = new Date().toISOString().split('T')[0];
    }

    const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : null;
    const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;

    // Get old record for audit
    const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const oldColorRecord = oldColorRows[0];

    const newMeters = currentMeters + lenM;
    const newYards = currentYards + lenY;

    const updateInitial = update_initial_to_match === true || update_initial_to_match === 'true';
    if (updateInitial) {
      await connection.query(
        `UPDATE colors 
         SET length_meters = ?, 
             length_yards = ?, 
             initial_length_meters = ?, 
             initial_length_yards = ?,
             date = COALESCE(?, date),
             weight = COALESCE(?, weight),
             lot = COALESCE(?, lot),
             roll_nb = COALESCE(?, roll_nb)
         WHERE color_id = ?`,
        [newMeters, newYards, newMeters, newYards, rollDate, weight || null, lotValue, rollNbValue, colorId]
      );
    } else {
      await connection.query(
        `UPDATE colors 
         SET length_meters = ?, 
             length_yards = ?, 
             date = COALESCE(?, date),
             weight = COALESCE(?, weight),
             lot = COALESCE(?, lot),
             roll_nb = COALESCE(?, roll_nb)
         WHERE color_id = ?`,
        [newMeters, newYards, rollDate, weight || null, lotValue, rollNbValue, colorId]
      );
    }

    // Get updated record for audit
    const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const newColorRecord = newColorRows[0];
    
    // Log audit entry for length addition
    await logUpdate('colors', colorId, req.user, oldColorRecord, newColorRecord, req, `Added ${lenY}yd/${lenM}m to color`);

    await connection.commit();

    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after adding meters' });
    }

    res.status(200).json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error adding meters to color:', error);
    res.status(500).json({ error: error.message || 'Failed to add meters to color' });
  } finally {
    connection.release();
  }
}

// POST /api/colors/:color_id/add-meters - Add meters/yards to color
app.post('/api/colors/:color_id/add-meters', authMiddleware, addMetersToColorHandler);

// POST /api/colors/:color_id/rolls - Add roll (same as add-meters; used by Add Roll / Batch Add)
app.post('/api/colors/:color_id/rolls', authMiddleware, addMetersToColorHandler);

// ============================================
// COLOR LOTS ENDPOINTS
// ============================================

// GET /api/colors/:color_id/lots - Get all lots for a color
app.get('/api/colors/:color_id/lots', authMiddleware, async (req, res) => {
  try {
    const colorId = parseInt(req.params.color_id);
    
    // Verify color exists
    const [colors] = await db.query('SELECT color_id FROM colors WHERE color_id = ?', [colorId]);
    if (colors.length === 0) {
      return res.status(404).json({ error: 'Color not found' });
    }
    
    const [lots] = await db.query(
      'SELECT * FROM color_lots WHERE color_id = ? ORDER BY lot_id',
      [colorId]
    );
    
    const formattedLots = lots.map(lot => ({
      lot_id: lot.lot_id,
      color_id: lot.color_id,
      lot_number: lot.lot_number,
      length_meters: parseFloat(lot.length_meters) || 0,
      length_yards: parseFloat(lot.length_yards) || 0,
      initial_length_meters: lot.initial_length_meters ? parseFloat(lot.initial_length_meters) : null,
      initial_length_yards: lot.initial_length_yards ? parseFloat(lot.initial_length_yards) : null,
      date: lot.date,
      weight: lot.weight || null,
      roll_nb: lot.roll_nb || null,
      created_at: lot.created_at,
      updated_at: lot.updated_at
    }));
    
    res.json(formattedLots);
  } catch (error) {
    console.error('Error fetching lots:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch lots' });
  }
});

// POST /api/colors/:color_id/lots - Add a lot to a color
app.post('/api/colors/:color_id/lots', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const { lot_number, length_meters, length_yards, date, weight, roll_nb } = req.body;
    
    if (!lot_number || !lot_number.trim()) {
      return res.status(400).json({ error: 'Lot number is required' });
    }
    
    const lotM = parseFloat(length_meters) || 0;
    const lotY = parseFloat(length_yards) || 0;
    
    if (lotM < 0 || lotY < 0) {
      return res.status(400).json({ error: 'Lot lengths must be non-negative' });
    }
    
    await connection.beginTransaction();
    
    // Verify color exists and get total length
    const [colors] = await connection.query(
      'SELECT color_id, fabric_id, length_meters, length_yards FROM colors WHERE color_id = ? FOR UPDATE',
      [colorId]
    );
    if (colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    
    const fabricId = colors[0].fabric_id;
    const totalMeters = parseFloat(colors[0].length_meters) || 0;
    const totalYards = parseFloat(colors[0].length_yards) || 0;
    
    // Check for duplicate lot number
    const [existing] = await connection.query(
      'SELECT lot_id FROM color_lots WHERE color_id = ? AND lot_number = ?',
      [colorId, lot_number.trim()]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Lot number already exists for this color' });
    }
    
    // Get current sum of lot lengths
    const [currentLots] = await connection.query(
      'SELECT SUM(length_meters) as sum_meters, SUM(length_yards) as sum_yards FROM color_lots WHERE color_id = ?',
      [colorId]
    );
    const currentSumM = parseFloat(currentLots[0]?.sum_meters) || 0;
    const currentSumY = parseFloat(currentLots[0]?.sum_yards) || 0;
    
    // Validate that adding this lot doesn't exceed total
    const newSumM = currentSumM + lotM;
    const newSumY = currentSumY + lotY;
    const tolerance = 0.01;
    
    if (newSumM > totalMeters + tolerance || newSumY > totalYards + tolerance) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Adding this lot would exceed total length. Current sum: ${currentSumM}m/${currentSumY}yd, Adding: ${lotM}m/${lotY}yd, Total: ${totalMeters}m/${totalYards}yd` 
      });
    }
    
    // Insert lot
    const lotDate = date ? String(date).trim() : new Date().toISOString().split('T')[0];
    const lotWeight = (weight && typeof weight === 'string' && weight.trim() !== '') ? weight.trim() : null;
    const lotRollNb = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;
    
    // Set initial length when creating lot (first non-zero length)
    const initialLotM = (lotM > 0) ? lotM : null;
    const initialLotY = (lotY > 0) ? lotY : null;
    
    const userId = req.user ? req.user.user_id : null;
    const [result] = await connection.query(
      'INSERT INTO color_lots (color_id, lot_number, length_meters, length_yards, initial_length_meters, initial_length_yards, date, weight, roll_nb, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [colorId, lot_number.trim(), lotM, lotY, initialLotM, initialLotY, lotDate, lotWeight, lotRollNb, userId]
    );
    
    // Get created lot for audit
    const [newLotRows] = await connection.query('SELECT * FROM color_lots WHERE lot_id = ?', [result.insertId]);
    await logInsert('color_lots', result.insertId, req.user, newLotRows[0], req, `Created lot: ${lot_number.trim()} (${lotY}yd/${lotM}m)`);
    
    await connection.commit();
    
    // Return updated fabric structure
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after adding lot' });
    }
    
    res.status(201).json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error adding lot:', error);
    res.status(500).json({ error: error.message || 'Failed to add lot' });
  } finally {
    connection.release();
  }
});

// PUT /api/colors/:color_id/lots/:lot_id - Update a lot
app.put('/api/colors/:color_id/lots/:lot_id', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const lotId = parseInt(req.params.lot_id);
    const { lot_number, length_meters, length_yards, date, weight, roll_nb } = req.body;
    
    if (!lot_number || !lot_number.trim()) {
      return res.status(400).json({ error: 'Lot number is required' });
    }
    
    const lotM = parseFloat(length_meters) || 0;
    const lotY = parseFloat(length_yards) || 0;
    
    if (lotM < 0 || lotY < 0) {
      return res.status(400).json({ error: 'Lot lengths must be non-negative' });
    }
    
    await connection.beginTransaction();
    
    // Verify lot exists and belongs to color
    const [lots] = await connection.query(
      'SELECT lot_id, color_id FROM color_lots WHERE lot_id = ? AND color_id = ?',
      [lotId, colorId]
    );
    if (lots.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Lot not found' });
    }
    
    // Get color total length
    const [colors] = await connection.query(
      'SELECT fabric_id, length_meters, length_yards FROM colors WHERE color_id = ? FOR UPDATE',
      [colorId]
    );
    const fabricId = colors[0].fabric_id;
    const totalMeters = parseFloat(colors[0].length_meters) || 0;
    const totalYards = parseFloat(colors[0].length_yards) || 0;
    
    // Check for duplicate lot number (excluding current lot)
    const [existing] = await connection.query(
      'SELECT lot_id FROM color_lots WHERE color_id = ? AND lot_number = ? AND lot_id != ?',
      [colorId, lot_number.trim(), lotId]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Lot number already exists for this color' });
    }
    
    // Get old record for audit
    const [oldLotRows] = await connection.query('SELECT * FROM color_lots WHERE lot_id = ?', [lotId]);
    if (oldLotRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Lot not found' });
    }
    const oldLotRecord = oldLotRows[0];
    const oldLotM = parseFloat(oldLotRecord.length_meters) || 0;
    const oldLotY = parseFloat(oldLotRecord.length_yards) || 0;
    
    // Get current sum of all other lots (excluding this one)
    const [otherLots] = await connection.query(
      'SELECT SUM(length_meters) as sum_meters, SUM(length_yards) as sum_yards FROM color_lots WHERE color_id = ? AND lot_id != ?',
      [colorId, lotId]
    );
    const otherSumM = parseFloat(otherLots[0]?.sum_meters) || 0;
    const otherSumY = parseFloat(otherLots[0]?.sum_yards) || 0;
    
    // Validate that new sum doesn't exceed total
    const newSumM = otherSumM + lotM;
    const newSumY = otherSumY + lotY;
    const tolerance = 0.01;
    
    if (newSumM > totalMeters + tolerance || newSumY > totalYards + tolerance) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Updating this lot would exceed total length. Other lots sum: ${otherSumM}m/${otherSumY}yd, New lot: ${lotM}m/${lotY}yd, Total: ${totalMeters}m/${totalYards}yd` 
      });
    }
    
    // Update lot
    const lotDate = date ? String(date).trim() : null;
    const lotWeight = (weight && typeof weight === 'string' && weight.trim() !== '') ? weight.trim() : null;
    const lotRollNb = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;
    
    const userId = req.user ? req.user.user_id : null;
    await connection.query(
      'UPDATE color_lots SET lot_number = ?, length_meters = ?, length_yards = ?, date = ?, weight = ?, roll_nb = ?, updated_by_user_id = ? WHERE lot_id = ?',
      [lot_number.trim(), lotM, lotY, lotDate, lotWeight, lotRollNb, userId, lotId]
    );
    
    // Get updated record for audit
    const [newLotRows] = await connection.query('SELECT * FROM color_lots WHERE lot_id = ?', [lotId]);
    await logUpdate('color_lots', lotId, req.user, oldLotRecord, newLotRows[0], req, `Updated lot: ${lot_number.trim()}`);
    
    await connection.commit();
    
    // Return updated fabric structure
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after updating lot' });
    }
    
    res.json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating lot:', error);
    res.status(500).json({ error: error.message || 'Failed to update lot' });
  } finally {
    connection.release();
  }
});

// DELETE /api/colors/:color_id/lots/:lot_id - Delete a lot
app.delete('/api/colors/:color_id/lots/:lot_id', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const lotId = parseInt(req.params.lot_id);
    
    await connection.beginTransaction();
    
    // Verify lot exists and get record before deletion
    const [lots] = await connection.query(
      'SELECT * FROM color_lots WHERE lot_id = ? AND color_id = ?',
      [lotId, colorId]
    );
    if (lots.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Lot not found' });
    }
    const lotRecord = lots[0];
    
    const [colors] = await connection.query(
      'SELECT fabric_id FROM colors WHERE color_id = ?',
      [colorId]
    );
    const fabricId = colors[0].fabric_id;
    
    // Delete lot
    await connection.query('DELETE FROM color_lots WHERE lot_id = ?', [lotId]);
    
    // Log audit entry
    await logDelete('color_lots', lotId, req.user, lotRecord, req, `Deleted lot: ${lotRecord.lot_number}`);
    
    await connection.commit();
    
    // Return updated fabric structure
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after deleting lot' });
    }
    
    res.json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting lot:', error);
    res.status(500).json({ error: error.message || 'Failed to delete lot' });
  } finally {
    connection.release();
  }
});

// PUT /api/rolls/bulk - Bulk update multiple rolls - DEPRECATED: No longer used
/* app.put('/api/rolls/bulk', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { updates } = req.body; // Array of { roll_id, date, lot, roll_nb, weight }
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required' });
    }

    await connection.beginTransaction();

    for (const { roll_id, date, lot, roll_nb, weight } of updates) {
      const rollId = parseInt(roll_id);
      if (isNaN(rollId)) {
        await connection.rollback();
        return res.status(400).json({ error: `Invalid roll_id: ${roll_id}` });
      }

      // Check roll exists
      const [rolls] = await connection.query('SELECT roll_id FROM rolls WHERE roll_id = ?', [rollId]);
      if (rolls.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Roll ${rollId} not found` });
      }

      // Build update query dynamically
      const updateFields = {};
      const values = [];
      
      if (date !== undefined && date !== null && date !== '') {
        let rollDate = String(date).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rollDate)) {
          await connection.rollback();
          return res.status(400).json({ error: `Invalid date format for roll ${rollId}` });
        }
        updateFields.date = rollDate;
        values.push(rollDate);
      }
      
      if (lot !== undefined) {
        const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : null;
        updateFields.lot = lotValue;
        values.push(lotValue);
      }
      
      if (roll_nb !== undefined) {
        const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;
        updateFields.roll_nb = rollNbValue;
        values.push(rollNbValue);
      }
      
      if (weight !== undefined) {
        updateFields.weight = weight || 'N/A';
        values.push(weight || 'N/A');
      }

      if (Object.keys(updateFields).length > 0) {
        const fields = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
        values.push(rollId);
        await connection.query(`UPDATE rolls SET ${fields} WHERE roll_id = ?`, values);
      }
    }

    await connection.commit();

    // Return updated aggregated fabric structure (only call once at the end)
    const fabrics = await buildFabricColorAggregatedStructure();
    res.json({ fabrics, updated_count: updates.length });
  } catch (error) {
    await connection.rollback();
    console.error('Error bulk updating rolls:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk update rolls' });
  } finally {
    connection.release();
  }
});

// PUT /api/rolls/:roll_id - Update roll - DEPRECATED: No longer used
/* app.put('/api/rolls/:roll_id', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    console.log('PUT /api/rolls/:roll_id - Full req.body:', JSON.stringify(req.body))
    const { date, length_meters, length_yards, is_trimmable, weight, lot, roll_nb } = req.body;

    await connection.beginTransaction();

    // Check roll exists
    const [rolls] = await connection.query('SELECT roll_id FROM rolls WHERE roll_id = ?', [rollId]);
    if (rolls.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Roll not found' });
    }

    // Build update query dynamically
    const updates = {};
    const values = [];
    if (date !== undefined) {
      // FIX DATE SAVE ISSUE: Properly handle date - preserve user-entered date
      // Accept date as string (YYYY-MM-DD) from date input
      let rollDate = date
      console.log('PUT /api/rolls/:roll_id - Received date:', date, 'Type:', typeof date)
      
      // Convert to string if it's not already (handle null, undefined, Date objects)
      if (rollDate != null && rollDate !== undefined) {
        if (rollDate instanceof Date) {
          rollDate = rollDate.toISOString().split('T')[0]
        } else {
          rollDate = String(rollDate).trim()
        }
      } else {
        rollDate = ''
      }
      
      // Only default to today if date is truly missing or invalid
      if (!rollDate || rollDate === '' || rollDate === 'Invalid Date' || rollDate === 'null' || rollDate === 'undefined' || rollDate === 'NaN') {
        console.log('Date missing or invalid in PUT, using today. Original received:', date)
        rollDate = new Date().toISOString().split('T')[0]
      } else {
        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rollDate)) {
          console.warn('Invalid date format in PUT, using today. Received:', rollDate, 'Original:', date)
          rollDate = new Date().toISOString().split('T')[0]
        } else {
          console.log('PUT: Updating roll with date:', rollDate) // Debug log
        }
      }
      updates.date = rollDate;
      values.push(rollDate);
    }
    if (length_meters !== undefined) {
      const lenM = parseFloat(length_meters);
      if (isNaN(lenM) || lenM < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid length_meters' });
      }
      updates.length_meters = lenM;
      values.push(lenM);
    }
    if (length_yards !== undefined) {
      const lenY = parseFloat(length_yards);
      if (isNaN(lenY) || lenY < 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid length_yards' });
      }
      updates.length_yards = lenY;
      values.push(lenY);
    }
    if (is_trimmable !== undefined) {
      updates.is_trimmable = Boolean(is_trimmable);
      values.push(Boolean(is_trimmable));
    }
    if (weight !== undefined) {
      updates.weight = weight;
      values.push(weight);
    }
    if (lot !== undefined) {
      // FIX ISSUE #5: Properly handle LOT - trim and convert empty to null
      const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : null;
      updates.lot = lotValue;
      values.push(lotValue);
    }
    if (roll_nb !== undefined) {
      // FIX ISSUE #5: Properly handle ROLL nb - trim and convert empty to null
      const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : null;
      updates.roll_nb = rollNbValue;
      values.push(rollNbValue);
    }

    if (Object.keys(updates).length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No fields to update' });
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    values.push(rollId);
    
    await connection.query(`UPDATE rolls SET ${fields} WHERE roll_id = ?`, values);

    await connection.commit();

    // Return updated aggregated fabric structure
    const fabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = fabrics.find(f => {
      // Find fabric that contains this roll's color
      return f.colors?.some(c => {
        // We can't check individual rolls in aggregated structure, so return fabric if it has colors
        // The roll update will be reflected in the aggregated totals
        return true;
      });
    });
    
    // Find the fabric by checking which fabric_id the roll belongs to
    const [rollData] = await db.query('SELECT fabric_id FROM rolls WHERE roll_id = ?', [rollId]);
    if (rollData.length > 0) {
      const fabric = fabrics.find(f => f.fabric_id === rollData[0].fabric_id);
      if (fabric) {
        return res.json(fabric);
      }
    }
    
    res.status(404).json({ error: 'Fabric not found for updated roll' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating roll:', error);
    res.status(500).json({ error: error.message || 'Failed to update roll' });
  } finally {
    connection.release();
  }
}); */

// POST /api/rolls/:roll_id/trim - Trim roll - DEPRECATED: No longer used
/* app.post('/api/rolls/:roll_id/trim', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    const { amount_meters, customer_id, customer_name, notes } = req.body;

    // Validation
    const trimAmount = parseFloat(amount_meters);
    if (isNaN(trimAmount) || trimAmount <= 0) {
      return res.status(400).json({ error: 'Trim amount must be a positive number' });
    }

    await connection.beginTransaction();

    // Get roll with lock (FOR UPDATE prevents concurrent modifications)
    const [rolls] = await connection.query(
      'SELECT roll_id, color_id, fabric_id, length_meters, length_yards, is_trimmable, weight FROM rolls WHERE roll_id = ? FOR UPDATE',
      [rollId]
    );
    if (rolls.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Roll not found' });
    }

    const roll = rolls[0];
    if (!roll.is_trimmable) {
      await connection.rollback();
      return res.status(400).json({ error: 'Roll is not trimmable' });
    }

    const currentLength = parseFloat(roll.length_meters);
    if (trimAmount > currentLength) {
      await connection.rollback();
      return res.status(400).json({ error: 'Trim amount exceeds roll length' });
    }

    // Get fabric and color info for log
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code FROM fabrics WHERE fabric_id = ?', [roll.fabric_id]);
    const [colors] = await connection.query('SELECT color_name FROM colors WHERE color_id = ?', [roll.color_id]);
    const fabric = fabrics[0];
    const color = colors[0];

    // Calculate new length
    const newLengthM = Math.max(0, currentLength - trimAmount);
    const newLengthY = newLengthM * 1.0936;

    // Update roll (or mark as sold if length becomes 0)
    // We keep the roll in the database so roll_id can be used for returns/cancels
    if (newLengthM <= 0) {
      // Mark as sold instead of deleting, so roll_id remains valid for transaction history
      await connection.query('UPDATE rolls SET length_meters = 0, length_yards = 0, sold = TRUE WHERE roll_id = ?', [rollId]);
    } else {
      await connection.query(
        'UPDATE rolls SET length_meters = ?, length_yards = ? WHERE roll_id = ?',
        [newLengthM, newLengthY, rollId]
      );
    }

    // Handle transaction group creation/update
    const transaction_group_id = req.body.transaction_group_id || null;
    const transaction_type = req.body.transaction_type || 'A'; // Default to 'A' if not provided
    if (transaction_group_id) {
      await createOrUpdateTransactionGroup(
        connection,
        transaction_group_id,
        customer_id,
        customer_name,
        notes,
        trimAmount,
        transaction_type,
        null // Use current time
      );
    }

    // Create log entry
    const now = getLebanonTimestamp();
    const salesperson_id = req.body.salesperson_id || null;
    const conducted_by_user_id = req.user ? req.user.user_id : null;
    await connection.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, transaction_group_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['trim', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, trimAmount, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz, transaction_group_id, salesperson_id, conducted_by_user_id]
    );

    await connection.commit();

    // Return updated aggregated fabric structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === roll.fabric_id);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error trimming roll:', error);
    res.status(500).json({ error: error.message || 'Failed to trim roll' });
  } finally {
    connection.release();
  }
});

// POST /api/rolls/:roll_id/sell - Sell roll - DEPRECATED: No longer used
/* app.post('/api/rolls/:roll_id/sell', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    const { customer_id, customer_name, notes } = req.body;

    await connection.beginTransaction();

    // Get roll with lock
    const [rolls] = await connection.query(
      'SELECT roll_id, color_id, fabric_id, length_meters, length_yards, is_trimmable, weight FROM rolls WHERE roll_id = ? FOR UPDATE',
      [rollId]
    );
    if (rolls.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Roll not found' });
    }

    const roll = rolls[0];

    // Get fabric and color info for log
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code FROM fabrics WHERE fabric_id = ?', [roll.fabric_id]);
    const [colors] = await connection.query('SELECT color_name FROM colors WHERE color_id = ?', [roll.color_id]);
    const fabric = fabrics[0];
    const color = colors[0];

    // Handle transaction group creation/update
    const transaction_group_id = req.body.transaction_group_id || null;
    const transaction_type = req.body.transaction_type || 'A'; // Default to 'A' if not provided
    const rollLengthMeters = parseFloat(roll.length_meters);
    if (transaction_group_id) {
      await createOrUpdateTransactionGroup(
        connection,
        transaction_group_id,
        customer_id,
        customer_name,
        notes,
        rollLengthMeters,
        transaction_type,
        null // Use current time
      );
    }

    // Create log entry BEFORE marking as sold
    const now = getLebanonTimestamp();
    const salesperson_id = req.body.salesperson_id || null;
    const conducted_by_user_id = req.user ? req.user.user_id : null;
    await connection.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, transaction_group_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['sell', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, rollLengthMeters, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz, transaction_group_id, salesperson_id, conducted_by_user_id]
    );

    // Mark roll as sold instead of deleting, so roll_id remains valid for transaction history
    await connection.query('UPDATE rolls SET sold = TRUE WHERE roll_id = ?', [rollId]);

    await connection.commit();

    // Return updated aggregated fabric structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === roll.fabric_id);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error selling roll:', error);
    res.status(500).json({ error: error.message || 'Failed to sell roll' });
  } finally {
    connection.release();
  }
});

// POST /api/rolls/:roll_id/return - Return roll - DEPRECATED: No longer used
/* app.post('/api/rolls/:roll_id/return', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    let rollId = parseInt(req.params.roll_id) || null;
    const { amount_meters, customer_id, customer_name, notes, timestamp, epoch, reference_log_id, skip_log } = req.body;
    
    // If roll_id is 0 or invalid, but we have reference_log_id, look up the log to get roll_id
    if ((!rollId || rollId === 0 || isNaN(rollId)) && reference_log_id) {
      const [referenceLog] = await connection.query(
        'SELECT roll_id, fabric_id, color_id, is_trimmable, weight, type FROM logs WHERE log_id = ?',
        [reference_log_id]
      );
      if (referenceLog.length > 0) {
        const refLog = referenceLog[0];
        rollId = refLog.roll_id;
        
        // If roll_id is still NULL in the reference log, we need to create a new roll_id
        // This can happen if the log was created incorrectly
        if (!rollId || rollId === null) {
          // Generate a new roll_id - we'll need fabric_id and color_id from the log
          if (refLog.fabric_id && refLog.color_id) {
            // Get the next available roll_id for this color
            const [maxRoll] = await connection.query(
              'SELECT MAX(roll_id) as max_id FROM rolls WHERE color_id = ?',
              [refLog.color_id]
            );
            rollId = maxRoll.length > 0 && maxRoll[0].max_id ? maxRoll[0].max_id + 1 : 1;
            console.log(`Generated new roll_id ${rollId} for return operation from log ${reference_log_id}`);
          } else {
            await connection.rollback();
            return res.status(400).json({ error: 'Cannot determine roll_id: reference log is missing fabric_id or color_id' });
          }
        }
      } else {
        await connection.rollback();
        return res.status(404).json({ error: `Reference log ${reference_log_id} not found` });
      }
    }
    
    if (!rollId || rollId === 0 || isNaN(rollId)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid roll_id and no reference_log_id provided' });
    }

    // Validation
    const returnAmount = parseFloat(amount_meters);
    if (isNaN(returnAmount) || returnAmount <= 0) {
      return res.status(400).json({ error: 'Return amount must be a positive number' });
    }

    await connection.beginTransaction();

      // Get roll with lock (roll may be marked as sold, but it should still exist in the database)
      // If rollId is 0 or invalid, skip the roll lookup (we'll create from log data)
      let [rolls] = [];
      if (rollId && !isNaN(rollId) && rollId > 0) {
        // Fetch roll even if it's marked as sold - we need it for return operations
        [rolls] = await connection.query(
          'SELECT roll_id, color_id, fabric_id, length_meters, length_yards, is_trimmable, weight, sold FROM rolls WHERE roll_id = ? FOR UPDATE',
          [rollId]
        );
      }

    let roll;
    let isNewRoll = false;

    if (rolls.length === 0) {
      // Roll doesn't exist (was sold), need to recreate it
      // Get color and fabric info from logs
      // Try to find by roll_id first, then try by looking up recent sell logs if roll_id doesn't match
      let [logData] = await connection.query(
        'SELECT fabric_id, color_id, is_trimmable, weight, roll_id FROM logs WHERE roll_id = ? AND type = ? ORDER BY epoch DESC LIMIT 1',
        [rollId, 'sell']
      );
      
      // If not found by exact roll_id match, try to find any recent sell log for this fabric/color
      // This handles cases where roll_id might have been NULL or mismatched
      if (logData.length === 0) {
        console.warn(`No sell log found for roll_id ${rollId}, trying alternative lookup...`);
        // Try to find recent sell logs that might match (last resort)
        [logData] = await connection.query(
          'SELECT fabric_id, color_id, is_trimmable, weight, roll_id FROM logs WHERE type = ? ORDER BY epoch DESC LIMIT 10',
          ['sell']
        );
        // Filter for logs that might be related (same fabric/color pattern, or just use the most recent)
        if (logData.length > 0) {
          // Use the most recent sell log as fallback
          console.warn(`Using fallback: most recent sell log with roll_id ${logData[0].roll_id}`);
        }
      }
      
      if (logData.length === 0) {
        // Roll_id might be NULL in the log. Try to find the sell log using log_id if provided
        // Check if request body has a reference_log_id to help identify which log entry this return corresponds to
        const referenceLogId = req.body.reference_log_id || null;
        if (referenceLogId) {
          // Find the sell log by log_id instead of roll_id
          [logData] = await connection.query(
            'SELECT fabric_id, color_id, is_trimmable, weight, roll_id, amount_meters FROM logs WHERE log_id = ? AND type = ?',
            [referenceLogId, 'sell']
          );
        }
        
        if (logData.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            error: `Roll not found and no sell log found to recreate from. Roll ID: ${rollId}. If roll_id is NULL in the log, please provide reference_log_id in the request body.` 
          });
        }
      }

      const log = logData[0];
      // Validate we have all required information
      if (!log.fabric_id || !log.color_id) {
        await connection.rollback();
        return res.status(400).json({ 
          error: `Incomplete log data: missing fabric_id or color_id. Cannot recreate roll.` 
        });
      }
      
      roll = {
        roll_id: rollId,
        color_id: log.color_id,
        fabric_id: log.fabric_id,
        length_meters: 0,
        length_yards: 0,
        is_trimmable: log.is_trimmable !== null && log.is_trimmable !== undefined ? Boolean(log.is_trimmable) : true,
        weight: log.weight || 'N/A'
      };
      isNewRoll = true;
    } else {
      roll = rolls[0];
    }

    // Get fabric and color info
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code FROM fabrics WHERE fabric_id = ?', [roll.fabric_id]);
    const [colors] = await connection.query('SELECT color_name FROM colors WHERE color_id = ?', [roll.color_id]);
    
    if (fabrics.length === 0 || colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric or color not found' });
    }

    const fabric = fabrics[0];
    const color = colors[0];

    // Determine the correct length to restore
    // If roll is marked as sold, restore to exactly the returnAmount (what was sold)
    // Otherwise, add to existing length (for trim returns or partial returns)
    let newLengthM;
    let originalTransactionType = null;
    
    // Check if we have a reference log to determine original transaction type
    // This helps us know if we're canceling a sell vs trim transaction
    if (reference_log_id) {
      const [refLogData] = await connection.query(
        'SELECT type, amount_meters FROM logs WHERE log_id = ?',
        [reference_log_id]
      );
      if (refLogData.length > 0) {
        originalTransactionType = refLogData[0].type;
      }
    }
    
    // MySQL BOOLEAN is stored as TINYINT(1): 1 = true, 0 = false
    // MySQL2 returns it as 0 or 1 (number), not true/false
    const isSold = roll.sold === true || roll.sold === 1 || roll.sold === '1' || Boolean(roll.sold);
    
    // If roll is sold OR the original transaction was a sell, restore to exactly what was sold (returnAmount)
    // This fixes the bug where canceling a sell transaction would double the length
    // When a roll is sold, its length_meters still contains the original length, so adding returnAmount
    // would give us double the amount instead of the correct amount that was actually sold
    if (isSold || originalTransactionType === 'sell') {
      // Restore to exactly the amount that was sold/returned
      newLengthM = returnAmount;
      console.log(`Restoring sold roll ${rollId} to exact length: ${returnAmount}m (was ${roll.length_meters}m, sold=${roll.sold}, originalType=${originalTransactionType})`);
    } else {
      // For trim returns or returns to non-sold rolls, add to existing length
      // This handles cases where a roll was partially trimmed and we're returning some of it
      const currentLength = parseFloat(roll.length_meters) || 0;
      newLengthM = currentLength + returnAmount;
      console.log(`Adding return amount to existing roll ${rollId}: ${currentLength}m + ${returnAmount}m = ${newLengthM}m (sold=${roll.sold}, originalType=${originalTransactionType})`);
    }
    
    const newLengthY = newLengthM * 1.0936;

    if (isNewRoll) {
      // When recreating a sold roll, mark it as not sold
      await connection.query(
        'INSERT INTO rolls (roll_id, color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status, sold) VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, FALSE)',
        [rollId, roll.color_id, roll.fabric_id, newLengthM, newLengthY, roll.is_trimmable, roll.weight || 'N/A', 'available']
      );
    } else {
      // When returning to an existing roll, restore length and mark as not sold
      await connection.query(
        'UPDATE rolls SET length_meters = ?, length_yards = ?, sold = FALSE WHERE roll_id = ?',
        [newLengthM, newLengthY, rollId]
      );
    }

    // Check if this transaction has already been returned (prevent duplicate returns)
    if (!skip_log && reference_log_id) {
      const [existingReturns] = await connection.query(
        'SELECT log_id FROM logs WHERE type = ? AND reference_log_id = ?',
        ['return', reference_log_id]
      );
      if (existingReturns.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'This transaction has already been returned. Each transaction can only be returned once.' });
      }
    }

    // Create log entry only if skip_log is not true (used for cancellations)
    if (!skip_log) {
      const now = timestamp ? { iso: timestamp, epoch: epoch || Date.parse(timestamp.replace('T', ' ')), tz: 'Asia/Beirut' } : getLebanonTimestamp();
      const salesperson_id = req.body.salesperson_id || null;
      const conducted_by_user_id = req.user ? req.user.user_id : null;
      await connection.query(
        'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, reference_log_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['return', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, returnAmount, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz, reference_log_id || null, salesperson_id, conducted_by_user_id]
      );
    }

    await connection.commit();

    // Return updated aggregated fabric structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === roll.fabric_id);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error returning roll:', error);
    res.status(500).json({ error: error.message || 'Failed to return roll' });
  } finally {
    connection.release();
  }
}); */

// ============================================
// FABRIC+COLOR TRANSACTION ENDPOINTS (New aggregated system)
// ============================================

// Helper function to get color with roll attributes (for selling/trimming)
async function getColorForTransaction(connection, fabricId, colorId) {
  const [colors] = await connection.query(
    `SELECT color_id, fabric_id, color_name, length_meters, length_yards, 
            initial_length_meters, initial_length_yards,
            date, weight, lot, roll_nb, roll_count, status, sold
     FROM colors 
     WHERE fabric_id = ? AND color_id = ? 
       AND (sold = FALSE OR sold IS NULL OR sold = 0)
     FOR UPDATE`,
    [fabricId, colorId]
  );
  return colors[0] || null;
}

// POST /api/fabrics/:fabric_id/colors/:color_id/sell - Sell by meters (subtract from color)
app.post('/api/fabrics/:fabric_id/colors/:color_id/sell', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const colorId = parseInt(req.params.color_id);
    const { amount_meters, amount_yards, roll_count = 0, lot, roll_nb, customer_id, customer_name, notes, lot_id } = req.body;
    
    // Validation
    if (!fabricId || !colorId) {
      return res.status(400).json({ error: 'Invalid fabric_id or color_id' });
    }
    
    // Calculate amount - prioritize yards as primary unit
    let amountMeters = 0;
    let amountYards = 0;
    
    if (amount_yards !== undefined && amount_yards !== null && amount_yards > 0) {
      // Yards is primary - use it directly and convert to meters for storage
      amountYards = parseFloat(amount_yards);
      amountMeters = amountYards / 1.0936;
    } else if (amount_meters !== undefined && amount_meters !== null && amount_meters > 0) {
      // Fallback to meters if yards not provided
      amountMeters = parseFloat(amount_meters);
      amountYards = amountMeters * 1.0936;
    } else {
      return res.status(400).json({ error: 'Either amount_meters or amount_yards must be provided' });
    }
    
    if (isNaN(amountMeters) || amountMeters <= 0 || isNaN(amountYards) || amountYards <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    
    await connection.beginTransaction();
    
    // Get color with roll attributes (with lock for transaction)
    const color = await getColorForTransaction(connection, fabricId, colorId);
    
    if (!color) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found or already sold' });
    }
    
    // Get fabric info (including design for log formatting)
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code, design FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (fabrics.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric not found' });
    }
    const fabric = fabrics[0];
    
    // Handle lot_id if provided
    let selectedLot = null;
    let lotNumber = null;
    if (lot_id) {
      const [lots] = await connection.query(
        'SELECT * FROM color_lots WHERE lot_id = ? AND color_id = ? FOR UPDATE',
        [lot_id, colorId]
      );
      if (lots.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Lot not found' });
      }
      selectedLot = lots[0];
      lotNumber = selectedLot.lot_number;
      
      // Check if lot has enough length - use yards as primary
      const lotYards = parseFloat(selectedLot.length_yards) || 0;
      if (lotYards < amountYards) {
        await connection.rollback();
        return res.status(400).json({ 
          error: `Insufficient lot inventory. Available: ${lotYards.toFixed(2)}yd, Requested: ${amountYards.toFixed(2)}yd` 
        });
      }
      
      // Update lot length - subtract yards directly
      const newLotYards = lotYards - amountYards;
      const newLotMeters = newLotYards / 1.0936; // Convert to meters for storage
      await connection.query(
        'UPDATE color_lots SET length_meters = ?, length_yards = ? WHERE lot_id = ?',
        [newLotMeters, newLotYards, lot_id]
      );
    }
    
    // Check if we have enough length in color total - use yards as primary
    const currentYards = parseFloat(color.length_yards) || 0;
    if (currentYards < amountYards) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Insufficient inventory. Available: ${currentYards.toFixed(2)}yd, Requested: ${amountYards.toFixed(2)}yd` 
      });
    }
    
    // Calculate new length - use yards as primary for calculation
    const newYards = currentYards - amountYards; // Subtract yards directly
    const newMeters = newYards / 1.0936; // Convert back to meters for storage
    
    // Calculate new roll_count (decrease by roll_count from request, or default to 0 if not provided)
    // Ensure we're reading the current roll_count from the database, not from the color object which might be stale
    const [currentColorData] = await connection.query(
      'SELECT roll_count FROM colors WHERE color_id = ?',
      [colorId]
    );
    const currentRollCount = currentColorData && currentColorData.length > 0 
      ? (parseInt(currentColorData[0].roll_count) || 0) 
      : (parseInt(color.roll_count) || 0);
    const sellRollCount = parseInt(roll_count) || 0;
    const newRollCount = Math.max(0, currentRollCount - sellRollCount);
    
    // Get old record for audit
    const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const oldColorRecord = oldColorRows[0];
    
    // Update color (subtract yards directly, convert to meters for storage)
    await connection.query(
      'UPDATE colors SET length_meters = ?, length_yards = ?, roll_count = ?, sold = CASE WHEN ? <= 0 THEN 1 ELSE 0 END WHERE color_id = ?',
      [newMeters, newYards, newRollCount, newMeters, colorId]
    );

    // Get updated record for audit
    const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const newColorRecord = newColorRows[0];
    
    // Log audit entry for sell operation
    const currentMeters = parseFloat(color.length_meters) || 0;
    const sellMeters = currentMeters - newMeters;
    const sellYards = currentYards - newYards;
    await logUpdate('colors', colorId, req.user, oldColorRecord, newColorRecord, req, `Sold ${sellYards.toFixed(2)}yd/${sellMeters.toFixed(2)}m from color`);
    
    // Handle transaction group
    const transactionGroupId = req.body.transaction_group_id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionType = req.body.transaction_type || 'A';
    const transactionDate = req.body.transaction_date || null;
    const transactionEpoch = req.body.epoch || null;
    
    if (transactionGroupId) {
      await createOrUpdateTransactionGroup(
        connection,
        transactionGroupId,
        customer_id,
        customer_name,
        notes,
        amountMeters,
        transactionType,
        transactionEpoch,
        transactionDate
      );
    }
    
    // Create log entry (no roll_id, include lot and roll_nb as metadata)
    const now = getLebanonTimestamp();
    const salespersonId = req.body.salesperson_id || null;
    const conductedByUserId = req.user ? req.user.user_id : null;
    // Use lot number from selected lot if lot_id provided, otherwise use provided lot or color.lot
    const lotValue = lotNumber || ((lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : color.lot);
    const rollNbValue = selectedLot?.roll_nb || ((roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : color.roll_nb);
    
    // Format fabric name with design code for logs
    const fabricNameForLog = fabric.design && fabric.design !== 'none' 
      ? `${fabric.fabric_name} [${fabric.design}]` 
      : fabric.fabric_name;
    
    await connection.query(
      'INSERT INTO logs (type, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['sell', fabricId, colorId, fabricNameForLog, color.color_name, customer_id || null, customer_name || null, amountMeters, parseInt(roll_count) || 0, color.weight || 'N/A', lotValue, rollNbValue, notes || null, now.iso, now.epoch, now.tz, transactionGroupId, salespersonId, conductedByUserId]
    );
    
    await connection.commit();
    
    // Return updated aggregated structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === fabricId);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error selling color:', error);
    res.status(500).json({ error: error.message || 'Failed to sell color' });
  } finally {
    connection.release();
  }
});

// POST /api/fabrics/:fabric_id/colors/:color_id/return - Return fabric color (add back to inventory)
app.post('/api/fabrics/:fabric_id/colors/:color_id/return', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const colorId = parseInt(req.params.color_id);
    const { 
      amount_meters, 
      amount_yards, 
      roll_count = 0,
      customer_id, 
      customer_name, 
      notes,
      reference_log_id,
      timestamp,
      epoch
    } = req.body;
    
    // Validation
    if (!fabricId || !colorId) {
      return res.status(400).json({ error: 'Invalid fabric_id or color_id' });
    }
    
    // Calculate amount in meters
    let amountMeters = 0;
    if (amount_yards !== undefined && amount_yards !== null) {
      amountMeters = parseFloat(amount_yards) / 1.0936;
    } else if (amount_meters !== undefined && amount_meters !== null) {
      amountMeters = parseFloat(amount_meters);
    } else {
      return res.status(400).json({ error: 'Either amount_meters or amount_yards must be provided' });
    }
    
    if (isNaN(amountMeters) || amountMeters <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    
    await connection.beginTransaction();
    
    // If reference_log_id is provided and roll_count is not explicitly set, get roll_count from the reference log
    let finalRollCount = parseInt(roll_count) || 0;
    if (reference_log_id && (roll_count === undefined || roll_count === null || roll_count === 0)) {
      const [refLogs] = await connection.query(
        'SELECT roll_count FROM logs WHERE log_id = ?',
        [reference_log_id]
      );
      if (refLogs.length > 0 && refLogs[0].roll_count !== null && refLogs[0].roll_count !== undefined) {
        finalRollCount = parseInt(refLogs[0].roll_count) || 0;
      }
    }
    
    // Get color with lock
    const color = await getColorForTransaction(connection, fabricId, colorId);
    if (!color) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    
    // Get fabric info (including design for log formatting)
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code, design FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (fabrics.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric not found' });
    }
    const fabric = fabrics[0];
    
    // Get old record for audit
    const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const oldColorRecord = oldColorRows[0];

    // Add meters/yards back to color. Optionally set initial = new current when update_initial_to_match.
    const currentMeters = parseFloat(color.length_meters) || 0;
    const currentYards = parseFloat(color.length_yards) || 0;
    const newMeters = currentMeters + amountMeters;
    const newYards = currentYards + (amountMeters * 1.0936);
    const currentRollCount = parseInt(color.roll_count) || 0;
    const newRollCount = currentRollCount + finalRollCount;
    const updateInitial = req.body.update_initial_to_match === true || req.body.update_initial_to_match === 'true';

    if (updateInitial) {
      await connection.query(
        'UPDATE colors SET length_meters = ?, length_yards = ?, initial_length_meters = ?, initial_length_yards = ?, roll_count = ?, sold = 0 WHERE color_id = ?',
        [newMeters, newYards, newMeters, newYards, newRollCount, colorId]
      );
    } else {
      await connection.query(
        'UPDATE colors SET length_meters = ?, length_yards = ?, roll_count = ?, sold = 0 WHERE color_id = ?',
        [newMeters, newYards, newRollCount, colorId]
      );
    }

    // Get updated record for audit
    const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [colorId]);
    const newColorRecord = newColorRows[0];
    
    // Log audit entry for return operation
    await logUpdate('colors', colorId, req.user, oldColorRecord, newColorRecord, req, `Returned ${(amountMeters * 1.0936).toFixed(2)}yd/${amountMeters.toFixed(2)}m to color`);
    
    // Create log entry for return (date-only, no time)
    const iso = timestamp ? normalizeTimestampToDate(timestamp) : null;
    const now = iso
      ? { iso, epoch: epoch != null ? Number(epoch) : new Date(iso).getTime(), tz: 'Asia/Beirut' }
      : getLebanonTimestamp();
    const salespersonId = req.body.salesperson_id || null;
    const conductedByUserId = req.user ? req.user.user_id : null;
    const lotValue = color.lot || null;
    const rollNbValue = color.roll_nb || null;
    
    // Format fabric name with design code for logs
    const fabricNameForLog = fabric.design && fabric.design !== 'none' 
      ? `${fabric.fabric_name} [${fabric.design}]` 
      : fabric.fabric_name;
    
    await connection.query(
      'INSERT INTO logs (type, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, reference_log_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['return', fabricId, colorId, fabricNameForLog, color.color_name, customer_id || null, customer_name || null, amountMeters, finalRollCount, color.weight || 'N/A', lotValue, rollNbValue, notes || null, now.iso, now.epoch, now.tz, reference_log_id || null, salespersonId, conductedByUserId]
    );
    
    await connection.commit();
    
    // Return updated aggregated structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === fabricId);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error returning color:', error);
    res.status(500).json({ error: error.message || 'Failed to return color' });
  } finally {
    connection.release();
  }
});

// POST /api/fabrics/:fabric_id/colors/:color_id/trim - DEPRECATED: Trim functionality removed
/* app.post('/api/fabrics/:fabric_id/colors/:color_id/trim', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const fabricId = parseInt(req.params.fabric_id);
    const colorId = parseInt(req.params.color_id);
    const { amount_meters, amount_yards, lot, roll_nb, customer_id, customer_name, notes } = req.body;
    
    // Validation
    if (!fabricId || !colorId) {
      return res.status(400).json({ error: 'Invalid fabric_id or color_id' });
    }
    
    // Calculate amount in meters
    let amountMeters = 0;
    if (amount_yards !== undefined && amount_yards !== null) {
      amountMeters = parseFloat(amount_yards) / 1.0936;
    } else if (amount_meters !== undefined && amount_meters !== null) {
      amountMeters = parseFloat(amount_meters);
    } else {
      return res.status(400).json({ error: 'Either amount_meters or amount_yards must be provided' });
    }
    
    if (isNaN(amountMeters) || amountMeters <= 0) {
      return res.status(400).json({ error: 'Trim amount must be a positive number' });
    }
    
    await connection.beginTransaction();
    
    // Get color with roll attributes (with lock for transaction, only if trimmable)
    const color = await getColorForTransaction(connection, fabricId, colorId);
    
    if (!color) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found or already sold' });
    }
    
    // Check if color is trimmable
    if (!color.is_trimmable) {
      await connection.rollback();
      return res.status(400).json({ error: 'This color is not trimmable' });
    }
    
    // Get fabric info
    const [fabrics] = await connection.query('SELECT fabric_name, fabric_code FROM fabrics WHERE fabric_id = ?', [fabricId]);
    if (fabrics.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Fabric not found' });
    }
    const fabric = fabrics[0];
    
    // Check if we have enough length
    const currentMeters = parseFloat(color.length_meters) || 0;
    if (currentMeters < amountMeters) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Insufficient trimmable inventory. Available: ${currentMeters.toFixed(2)}m, Requested: ${amountMeters.toFixed(2)}m` 
      });
    }
    
    // Calculate new length
    const newMeters = currentMeters - amountMeters;
    const newYards = newMeters * 1.0936;
    
    // Update color (subtract meters, mark as sold if length becomes 0)
    await connection.query(
      'UPDATE colors SET length_meters = ?, length_yards = ?, sold = CASE WHEN ? <= 0 THEN 1 ELSE sold END WHERE color_id = ?',
      [newMeters, newYards, newMeters, colorId]
    );
    
    // Handle transaction group
    const transactionGroupId = req.body.transaction_group_id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transactionType = req.body.transaction_type || 'A';
    const transactionDate = req.body.transaction_date || null;
    const transactionEpoch = req.body.epoch || null;
    
    if (transactionGroupId) {
      await createOrUpdateTransactionGroup(
        connection,
        transactionGroupId,
        customer_id,
        customer_name,
        notes,
        amountMeters,
        transactionType,
        transactionEpoch,
        transactionDate
      );
    }
    
    // Create log entry (no roll_id, include lot and roll_nb as metadata)
    const now = getLebanonTimestamp();
    const salespersonId = req.body.salesperson_id || null;
    const conductedByUserId = req.user ? req.user.user_id : null;
    const lotValue = (lot && typeof lot === 'string' && lot.trim() !== '') ? lot.trim() : color.lot;
    const rollNbValue = (roll_nb && typeof roll_nb === 'string' && roll_nb.trim() !== '') ? roll_nb.trim() : color.roll_nb;
    
    await connection.query(
      'INSERT INTO logs (type, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['trim', fabricId, colorId, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, amountMeters, 0, color.weight || 'N/A', lotValue, rollNbValue, notes || null, now.iso, now.epoch, now.tz, transactionGroupId, salespersonId, conductedByUserId]
    );
    
    await connection.commit();
    
    // Return updated aggregated structure
    const updatedFabrics = await buildFabricColorAggregatedStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === fabricId);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error trimming color:', error);
    res.status(500).json({ error: error.message || 'Failed to trim color' });
  } finally {
    connection.release();
  }
}); */

// ============================================
// LOGS ENDPOINTS (Accept fabricIndex/colorIndex, store fabricId/colorId)
// ============================================

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { type, fabricId, colorId, rollId, start, end, minLength, maxLength } = req.query;
    
    let query = `
      SELECT 
        l.*,
        s.name as salesperson_name,
        u.username as conducted_by_username,
        u.full_name as conducted_by_full_name,
        tg.transaction_type,
        tg.permit_number,
        tg.notes as transaction_group_notes
      FROM logs l
      LEFT JOIN salespersons s ON l.salesperson_id = s.salesperson_id
      LEFT JOIN users u ON l.conducted_by_user_id = u.user_id
      LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      query += ' AND l.type = ?';
      params.push(type);
    }
    if (fabricId) {
      query += ' AND l.fabric_id = ?';
      params.push(parseInt(fabricId));
    }
    if (colorId) {
      query += ' AND l.color_id = ?';
      params.push(parseInt(colorId));
    }
    if (rollId) {
      query += ' AND l.roll_id LIKE ?';
      params.push(`%${rollId}%`);
    }
    if (start) {
      query += ' AND l.epoch >= ?';
      params.push(parseInt(start));
    }
    if (end) {
      query += ' AND l.epoch <= ?';
      params.push(parseInt(end));
    }
    if (minLength) {
      query += ' AND l.amount_meters >= ?';
      params.push(parseFloat(minLength));
    }
    if (maxLength) {
      query += ' AND l.amount_meters <= ?';
      params.push(parseFloat(maxLength));
    }

    query += ' ORDER BY l.epoch DESC, l.log_id DESC';
    
    const [logs] = await db.query(query, params);
    
    // Convert database format to JSON format (expose DB columns + camelCase for compatibility)
    const formattedLogs = logs.map(log => ({
      log_id: log.log_id,
      type: log.type,
      roll_id: log.roll_id,
      fabric_id: log.fabric_id || null,
      color_id: log.color_id || null,
      customer_id: log.customer_id || null,
      fabric_name: log.fabric_name,
      color_name: log.color_name,
      customer_name: log.customer_name,
      amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      // For sell logs, also expose length_meters (same as amount_meters for compatibility)
      length_meters: log.type === 'sell' ? (log.amount_meters ? parseFloat(log.amount_meters) : 0) : null,
      roll_count: log.roll_count !== undefined && log.roll_count !== null ? parseInt(log.roll_count) : null,
      lot: log.lot || null,
      roll_nb: log.roll_nb || null,
      is_trimmable: Boolean(log.is_trimmable),
      weight: log.weight,
      notes: log.transaction_group_notes || log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      timezone: log.timezone,
      reference_log_id: log.reference_log_id || null,
      transaction_group_id: log.transaction_group_id || null,
      salesperson_id: log.salesperson_id || null,
      salesperson_name: log.salesperson_name || null,
      conducted_by_user_id: log.conducted_by_user_id || null,
      conducted_by_username: log.conducted_by_username || null,
      conducted_by_full_name: log.conducted_by_full_name || null,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // compatibility camelCase aliases
      id: log.log_id,
      log_id: log.log_id,
      rollId: log.roll_id,
      fabricId: log.fabric_id || null,
      colorId: log.color_id || null,
      customerId: log.customer_id || null,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerName: log.customer_name,
      length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      rollCount: log.roll_count !== undefined && log.roll_count !== null ? parseInt(log.roll_count) : null,
      rollNb: log.roll_nb || null,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      referenceLogId: log.reference_log_id || null,
      transactionGroupId: log.transaction_group_id || null,
      transactionType: log.transaction_type || null,
      permitNumber: log.permit_number || null,
      salespersonId: log.salesperson_id || null,
      salespersonName: log.salesperson_name || null,
      conductedByUserId: log.conducted_by_user_id || null,
      conductedByUserName: log.conducted_by_full_name || log.conducted_by_username || null
    }));

    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/logs/:id', authMiddleware, async (req, res) => {
  try {
    const [logs] = await db.query(`
      SELECT 
        l.*,
        s.name as salesperson_name,
        u.username as conducted_by_username,
        u.full_name as conducted_by_full_name
      FROM logs l
      LEFT JOIN salespersons s ON l.salesperson_id = s.salesperson_id
      LEFT JOIN users u ON l.conducted_by_user_id = u.user_id
      WHERE l.log_id = ?
    `, [req.params.id]);
    if (logs.length > 0) {
      const log = logs[0];
      res.json({
        log_id: log.log_id,
        type: log.type,
        roll_id: log.roll_id,
        fabric_id: log.fabric_id || null,
        color_id: log.color_id || null,
        customer_id: log.customer_id || null,
        fabric_name: log.fabric_name,
        color_name: log.color_name,
        customer_name: log.customer_name,
        amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
        is_trimmable: Boolean(log.is_trimmable),
        weight: log.weight,
        notes: log.notes,
        timestamp: log.timestamp,
        epoch: log.epoch,
        timezone: log.timezone,
        reference_log_id: log.reference_log_id || null,
        transaction_group_id: log.transaction_group_id || null,
        salesperson_id: log.salesperson_id || null,
        salesperson_name: log.salesperson_name || null,
        conducted_by_user_id: log.conducted_by_user_id || null,
        conducted_by_username: log.conducted_by_username || null,
        conducted_by_full_name: log.conducted_by_full_name || null,
        created_at: log.created_at,
        updated_at: log.updated_at,
        // compatibility aliases
        id: log.log_id,
        log_id: log.log_id,
        rollId: log.roll_id,
        fabricId: log.fabric_id || null,
        colorId: log.color_id || null,
        customerId: log.customer_id || null,
        fabricName: log.fabric_name,
        colorName: log.color_name,
        customerName: log.customer_name,
        length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
        tz: log.timezone,
        isTrimmable: Boolean(log.is_trimmable),
        referenceLogId: log.reference_log_id || null,
        transactionGroupId: log.transaction_group_id || null,
        salespersonId: log.salesperson_id || null,
        salespersonName: log.salesperson_name || null,
        conductedByUserId: log.conducted_by_user_id || null,
        conductedByUserName: log.conducted_by_full_name || log.conducted_by_username || null
      });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    console.error('Error fetching log:', error);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

// GET /api/transaction-groups/:transaction_group_id - Get transaction group with all related logs (for delivery permit)
app.get('/api/transaction-groups/:transaction_group_id', authMiddleware, async (req, res) => {
  try {
    const transactionGroupId = req.params.transaction_group_id;
    
    // Get transaction group info
    const [groups] = await db.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    if (groups.length === 0) {
      return res.status(404).json({ error: 'Transaction group not found' });
    }
    
    const group = groups[0];
    
    // Get all related logs with fabric main_code
    const [logs] = await db.query(
      `SELECT 
        l.*,
        f.main_code as fabric_main_code
      FROM logs l
      LEFT JOIN fabrics f ON l.fabric_id = f.fabric_id
      WHERE l.transaction_group_id = ? 
      ORDER BY l.epoch ASC, l.log_id ASC`,
      [transactionGroupId]
    );
    
    // Format logs
    const formattedLogs = logs.map(log => ({
      log_id: log.log_id,
      type: log.type,
      roll_id: log.roll_id,
      fabric_id: log.fabric_id || null,
      color_id: log.color_id || null,
      customer_id: log.customer_id || null,
      fabric_name: log.fabric_name,
      color_name: log.color_name,
      customer_name: log.customer_name,
      main_code: log.fabric_main_code || null,
      amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      roll_count: log.roll_count !== undefined && log.roll_count !== null ? parseInt(log.roll_count) : 0,
      is_trimmable: Boolean(log.is_trimmable),
      weight: log.weight,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      timezone: log.timezone,
      transaction_group_id: log.transaction_group_id || null,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // compatibility aliases
      id: log.log_id,
      rollId: log.roll_id,
      fabricId: log.fabric_id || null,
      colorId: log.color_id || null,
      customerId: log.customer_id || null,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerName: log.customer_name,
      mainCode: log.fabric_main_code || null,
      length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      rollCount: log.roll_count !== undefined && log.roll_count !== null ? parseInt(log.roll_count) : 0,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      transactionGroupId: log.transaction_group_id || null
    }));
    
    // Return transaction group with items
    res.json({
      transaction_group_id: group.transaction_group_id,
      permit_number: group.permit_number || null,
      transaction_type: group.transaction_type || 'A',
      customer_id: group.customer_id || null,
      customer_name: group.customer_name,
      transaction_date: group.transaction_date,
      epoch: group.epoch,
      timezone: group.timezone,
      total_items: group.total_items,
      total_meters: parseFloat(group.total_meters) || 0,
      notes: group.notes,
      created_at: group.created_at,
      updated_at: group.updated_at,
      items: formattedLogs
    });
  } catch (error) {
    console.error('Error fetching transaction group:', error);
    res.status(500).json({ error: 'Failed to fetch transaction group' });
  }
});

// PUT /api/transaction-groups/:transaction_group_id/type - Update transaction type (permit numbers are manual)
app.put('/api/transaction-groups/:transaction_group_id/type', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const transactionGroupId = req.params.transaction_group_id;
    const { transaction_type, epoch } = req.body;
    
    if (!transaction_type || !['A', 'B'].includes(transaction_type)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Transaction type must be A or B' });
    }
    
    await connection.beginTransaction();
    
    // Get current transaction group
    const [groups] = await connection.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    if (groups.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction group not found' });
    }
    
    const currentGroup = groups[0];
    const oldType = currentGroup.transaction_type;
    const newEpoch = epoch || currentGroup.epoch;
    
    // Get old record for audit
    const oldGroupRecord = { ...currentGroup };
    
    // If type changed, just update the type - permit numbers are manual
    if (oldType !== transaction_type) {
      // Update transaction group with new type and epoch
      await connection.query(
        'UPDATE transaction_groups SET transaction_type = ?, epoch = ? WHERE transaction_group_id = ?',
        [transaction_type, newEpoch, transactionGroupId]
      );
      // Note: Permit number prefix should be updated by user if needed
    } else if (epoch && epoch !== currentGroup.epoch) {
      // Only epoch changed - DO NOT recalculate permit numbers (user wants manual control)
      // Store date-only (no time)
      const d = new Date(Number(epoch));
      const datePart = d.toISOString().split('T')[0];
      const isoString = datePart + 'T00:00:00';
      await connection.query(
        'UPDATE transaction_groups SET epoch = ?, transaction_date = ? WHERE transaction_group_id = ?',
        [newEpoch, isoString, transactionGroupId]
      );
      await connection.query(
        'UPDATE logs SET epoch = ?, timestamp = ? WHERE transaction_group_id = ?',
        [newEpoch, isoString, transactionGroupId]
      );
      // DO NOT call recalculatePermitNumbers - permit numbers are manually controlled
    }
    
    // Get updated record for audit
    const [newGroupRows] = await connection.query('SELECT * FROM transaction_groups WHERE transaction_group_id = ?', [transactionGroupId]);
    await logUpdate('transaction_groups', transactionGroupId, req.user, oldGroupRecord, newGroupRows[0], req, `Updated transaction group type: ${oldType} → ${transaction_type}`);
    
    await connection.commit();
    
    // Return updated transaction group
    const [updated] = await connection.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    const group = updated[0];
    res.json({
      transaction_group_id: group.transaction_group_id,
      permit_number: group.permit_number,
      transaction_type: group.transaction_type,
      customer_id: group.customer_id,
      customer_name: group.customer_name,
      transaction_date: group.transaction_date,
      epoch: group.epoch,
      timezone: group.timezone,
      total_items: group.total_items,
      total_meters: parseFloat(group.total_meters) || 0,
      notes: group.notes
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating transaction type:', error);
    res.status(500).json({ error: 'Failed to update transaction type' });
  } finally {
    connection.release();
  }
});

// PUT /api/transaction-groups/:transaction_group_id/permit-number - Update permit number with duplicate validation
// Allow both admin and limited users to update permit numbers
app.put('/api/transaction-groups/:transaction_group_id/permit-number', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const transactionGroupId = req.params.transaction_group_id;
    const { permit_number } = req.body;
    
    if (!permit_number || typeof permit_number !== 'string') {
      return res.status(400).json({ error: 'Permit number is required and must be a string' });
    }
    
    // Clean and validate format: should be "A-1" or "B-1" format
    // Remove any curly braces and convert to uppercase
    const cleanedPermit = permit_number.replace(/[{}]/g, '').trim().toUpperCase();
    
    const permitPattern = /^[AB]-\d+$/;
    if (!permitPattern.test(cleanedPermit)) {
      return res.status(400).json({ 
        error: 'Permit number must be in format "A-{number}" or "B-{number}" (e.g., "A-5" or "B-10")',
        received: permit_number
      });
    }
    
    await connection.beginTransaction();
    
    // Get current transaction group
    const [groups] = await connection.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    if (groups.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction group not found' });
    }
    
    const currentGroup = groups[0];
    
    // Get old record for audit
    const oldGroupRecord = { ...currentGroup };
    
    // Extract transaction type from permit number (A or B)
    const permitType = cleanedPermit.charAt(0).toUpperCase();
    
    // Check if permit number already exists (excluding current transaction)
    const [existing] = await connection.query(
      'SELECT transaction_group_id, permit_number FROM transaction_groups WHERE permit_number = ? AND transaction_group_id != ?',
      [cleanedPermit, transactionGroupId]
    );
    
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ 
        error: 'Duplicate permit number',
        message: `Another transaction already has permit number ${cleanedPermit}`,
        conflictingTransaction: existing[0].transaction_group_id
      });
    }
    
    // Validate that permit number prefix matches transaction type
    if (permitType !== currentGroup.transaction_type) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Permit number prefix must match transaction type',
        message: `Permit number starts with "${permitType}" but transaction type is "${currentGroup.transaction_type}". Please change the transaction type first.`
      });
    }
    
    // Update permit number only (transaction type is managed separately)
    await connection.query(
      'UPDATE transaction_groups SET permit_number = ? WHERE transaction_group_id = ?',
      [cleanedPermit, transactionGroupId]
    );
    
    // Get updated record for audit
    const [newGroupRows] = await connection.query('SELECT * FROM transaction_groups WHERE transaction_group_id = ?', [transactionGroupId]);
    await logUpdate('transaction_groups', transactionGroupId, req.user, oldGroupRecord, newGroupRows[0], req, `Updated permit number: ${oldGroupRecord.permit_number || 'none'} → ${cleanedPermit}`);
    
    await connection.commit();
    
    // Return updated transaction group
    const [updated] = await connection.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    const group = updated[0];
    res.json({
      transaction_group_id: group.transaction_group_id,
      permit_number: group.permit_number,
      transaction_type: group.transaction_type,
      customer_id: group.customer_id,
      customer_name: group.customer_name,
      transaction_date: group.transaction_date,
      epoch: group.epoch,
      timezone: group.timezone,
      total_items: group.total_items,
      total_meters: parseFloat(group.total_meters) || 0,
      notes: group.notes
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating permit number:', error);
    res.status(500).json({ error: 'Failed to update permit number' });
  } finally {
    connection.release();
  }
});

app.post('/api/logs', authMiddleware, async (req, res) => {
  try {
    const entry = req.body || {};
    const now = getLebanonTimestamp();
    
    // Validation
    if (!entry.type) {
      return res.status(400).json({ error: 'Log type is required' });
    }

    // Use database IDs directly (no more index resolution)
    const fabricId = entry.fabricId || entry.fabric_id;
    const colorId = entry.colorId || entry.color_id || null;
    let rollId = entry.rollId || entry.roll_id || null;

    if (!fabricId) {
      return res.status(400).json({ error: 'Fabric ID is required' });
    }

    // Validate roll_id exists if provided
    if (rollId) {
      const [rollExists] = await db.query('SELECT roll_id FROM rolls WHERE roll_id = ?', [rollId]);
      if (rollExists.length === 0) {
        console.warn(`Warning: Roll ID ${rollId} does not exist, setting to NULL`);
        rollId = null;
      }
    }

    const logData = {
      type: entry.type,
      roll_id: rollId,
      fabric_id: fabricId,
      color_id: colorId || null,
      fabric_name: entry.fabricName || null,
      color_name: entry.colorName || null,
      customer_id: entry.customerId || null,
      customer_name: entry.customerName || null,
      amount_meters: entry.amount_meters || entry.length_meters || 0,
      is_trimmable: entry.isTrimmable || false,
      weight: entry.weight || 'N/A',
      notes: entry.notes || null,
      timestamp: entry.timestamp || now.iso,
      epoch: entry.epoch || now.epoch,
      timezone: 'Asia/Beirut',
      salesperson_id: entry.salesperson_id || null,
      conducted_by_user_id: req.user ? req.user.user_id : null
    };

    const [result] = await db.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, salesperson_id, conducted_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logData.type, logData.roll_id, logData.fabric_id, logData.color_id, logData.fabric_name, logData.color_name, logData.customer_id, logData.customer_name, logData.amount_meters, logData.is_trimmable, logData.weight, logData.notes, logData.timestamp, logData.epoch, logData.timezone, logData.salesperson_id, logData.conducted_by_user_id]
    );

    // Return DB reality
    const [created] = await db.query('SELECT * FROM logs WHERE log_id = ?', [result.insertId]);
    const log = created[0];
    
    res.status(201).json({
      log_id: log.log_id,
      type: log.type,
      roll_id: log.roll_id,
      fabric_id: log.fabric_id,
      color_id: log.color_id,
      customer_id: log.customer_id,
      fabric_name: log.fabric_name,
      color_name: log.color_name,
      customer_name: log.customer_name,
      amount_meters: parseFloat(log.amount_meters) || 0,
      is_trimmable: Boolean(log.is_trimmable),
      weight: log.weight,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      timezone: log.timezone,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // compatibility aliases
      id: log.log_id,
      rollId: log.roll_id,
      fabricId: log.fabric_id,
      colorId: log.color_id,
      customerId: log.customer_id,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerName: log.customer_name,
      length_meters: parseFloat(log.amount_meters) || 0,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable)
    });
  } catch (error) {
    console.error('Error creating log:', error);
    // Provide more helpful error message
    const errorMessage = error.code === 'ER_NO_REFERENCED_ROW_2' 
      ? 'Invalid roll ID or fabric ID - record does not exist'
      : error.message || 'Failed to create log';
    res.status(500).json({ error: errorMessage });
  }
});

app.put('/api/logs/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const logId = parseInt(req.params.id);
    const updates = req.body;

    // Check log exists
    const [existing] = await db.query('SELECT log_id FROM logs WHERE log_id = ?', [logId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Log not found' });
    }

    const updateData = {};
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.rollId !== undefined) updateData.roll_id = updates.rollId;
    if (updates.fabricId !== undefined) updateData.fabric_id = updates.fabricId;
    if (updates.colorId !== undefined) updateData.color_id = updates.colorId;
    if (updates.fabricName !== undefined) updateData.fabric_name = updates.fabricName;
    if (updates.colorName !== undefined) updateData.color_name = updates.colorName;
    if (updates.customerId !== undefined) updateData.customer_id = updates.customerId;
    if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;
    if (updates.amount_meters !== undefined) updateData.amount_meters = updates.amount_meters;
    if (updates.isTrimmable !== undefined) updateData.is_trimmable = updates.isTrimmable;
    if (updates.weight !== undefined) updateData.weight = updates.weight;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    // Support lot and roll_nb attributes
    if (updates.lot !== undefined) {
      const lotValue = (updates.lot && typeof updates.lot === 'string' && updates.lot.trim() !== '') ? updates.lot.trim() : null;
      updateData.lot = lotValue;
    }
    if (updates.roll_nb !== undefined || updates.rollNb !== undefined) {
      const rollNbValue = ((updates.roll_nb || updates.rollNb) && typeof (updates.roll_nb || updates.rollNb) === 'string' && (updates.roll_nb || updates.rollNb).trim() !== '') ? (updates.roll_nb || updates.rollNb).trim() : null;
      updateData.roll_nb = rollNbValue;
    }
    if (updates.roll_count !== undefined || updates.rollCount !== undefined) {
      updateData.roll_count = parseInt(updates.roll_count || updates.rollCount) || 0;
    }
    if (updates.timestamp !== undefined && String(updates.timestamp || '').trim()) {
      const normalized = normalizeTimestampToDate(updates.timestamp);
      if (normalized) {
        updateData.timestamp = normalized;
        if (updates.epoch === undefined) updateData.epoch = new Date(normalized).getTime();
      } else {
        updateData.timestamp = updates.timestamp;
      }
    }
    if (updates.epoch !== undefined) updateData.epoch = updates.epoch;
    if (updates.salesperson_id !== undefined) updateData.salesperson_id = updates.salesperson_id;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Get old record before update
    const [oldLogRows] = await db.query('SELECT * FROM logs WHERE log_id = ?', [logId]);
    if (oldLogRows.length === 0) return res.status(404).json({ error: 'Log not found' });
    const oldLogRecord = oldLogRows[0];

    const fields = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateData), logId];
    
    await db.query(`UPDATE logs SET ${fields} WHERE log_id = ?`, values);

    // Return DB reality with salesperson info
    const [updated] = await db.query(`
      SELECT 
        l.*,
        s.name as salesperson_name
      FROM logs l
      LEFT JOIN salespersons s ON l.salesperson_id = s.salesperson_id
      WHERE l.log_id = ?
    `, [logId]);
    const log = updated[0];
    
    // Get updated record for audit
    const [newLogRows] = await db.query('SELECT * FROM logs WHERE log_id = ?', [logId]);
    await logUpdate('logs', logId, req.user, oldLogRecord, newLogRows[0], req, `Updated log entry`);
    
    res.json({
      log_id: log.log_id,
      type: log.type,
      roll_id: log.roll_id,
      fabric_id: log.fabric_id,
      color_id: log.color_id,
      customer_id: log.customer_id,
      fabric_name: log.fabric_name,
      color_name: log.color_name,
      customer_name: log.customer_name,
      amount_meters: parseFloat(log.amount_meters) || 0,
      is_trimmable: Boolean(log.is_trimmable),
      weight: log.weight,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      timezone: log.timezone,
      salesperson_id: log.salesperson_id || null,
      salesperson_name: log.salesperson_name || null,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // compatibility aliases
      id: log.log_id,
      rollId: log.roll_id,
      fabricId: log.fabric_id,
      colorId: log.color_id,
      customerId: log.customer_id,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerName: log.customer_name,
      length_meters: parseFloat(log.amount_meters) || 0,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      salespersonId: log.salesperson_id || null,
      salespersonName: log.salesperson_name || null
    });
  } catch (error) {
    console.error('Error updating log:', error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

app.delete('/api/logs/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Get record before deletion
    const [oldLogRows] = await db.query('SELECT * FROM logs WHERE log_id = ?', [req.params.id]);
    if (oldLogRows.length === 0) {
      return res.status(404).json({ error: 'Log not found' });
    }
    const oldLogRecord = oldLogRows[0];
    
    const [result] = await db.query('DELETE FROM logs WHERE log_id = ?', [req.params.id]);
    if (result.affectedRows > 0) {
      // Log audit entry
      await logDelete('logs', parseInt(req.params.id), req.user, oldLogRecord, req, `Deleted log entry`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// POST /api/logs/:log_id/cancel - Cancel a single log (restore roll, delete log, update transaction group)
// If it's the last log in the transaction group, delete the group and decrease permit counter
app.post('/api/logs/:log_id/cancel', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const logId = parseInt(req.params.log_id);
    
    await connection.beginTransaction();

    // Step 1: Get the log
    const [logs] = await connection.query('SELECT * FROM logs WHERE log_id = ?', [logId]);
    if (logs.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Log not found' });
    }
    
    const log = logs[0];
    const transactionGroupId = log.transaction_group_id;
    const returnAmount = parseFloat(log.amount_meters) || 0;
    const returnAmountYards = returnAmount * 1.0936;

    // Step 2: Restore/revert length to color (and lot if applicable) - SAVE FIRST before deleting log
    if ((log.type === 'sell' || log.type === 'trim' || log.type === 'return') && log.fabric_id && log.color_id && returnAmount > 0) {
      // Get color with lock
      const [colors] = await connection.query(
        'SELECT color_id, fabric_id, length_meters, length_yards, roll_count FROM colors WHERE color_id = ? AND fabric_id = ? FOR UPDATE',
        [log.color_id, log.fabric_id]
      );
      
      if (colors.length > 0) {
        const color = colors[0];
        const currentMeters = parseFloat(color.length_meters) || 0;
        const currentYards = parseFloat(color.length_yards) || 0;
        const currentRollCount = parseInt(color.roll_count) || 0;
        
        // Get roll_count from log
        const logRollCount = parseInt(log.roll_count) || 0;
        
        let newMeters, newYards, newRollCount;
        
        if (log.type === 'return') {
          // For return deletions: subtract length and roll_count (revert the return)
          newMeters = Math.max(0, currentMeters - returnAmount);
          newYards = Math.max(0, currentYards - returnAmountYards);
          newRollCount = Math.max(0, currentRollCount - logRollCount);
        } else {
          // For sell/trim deletions: add length and roll_count back to color
          newMeters = currentMeters + returnAmount;
          newYards = currentYards + returnAmountYards;
          newRollCount = currentRollCount + logRollCount;
        }
        
        // Get old record for audit
        const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [log.color_id]);
        const oldColorRecord = oldColorRows.length > 0 ? oldColorRows[0] : null;

        await connection.query(
          'UPDATE colors SET length_meters = ?, length_yards = ?, roll_count = ?, sold = 0 WHERE color_id = ?',
          [newMeters, newYards, newRollCount, log.color_id]
        );

        // Get updated record for audit
        const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [log.color_id]);
        const newColorRecord = newColorRows[0];
        
        // Log audit entry for transaction cancellation/restoration
        if (oldColorRecord) {
          const action = log.type === 'return' ? 'Reverted return' : `Restored from ${log.type}`;
          await logUpdate('colors', log.color_id, req.user, oldColorRecord, newColorRecord, req, `${action} - restored ${returnAmountYards.toFixed(2)}yd/${returnAmount.toFixed(2)}m`);
        }
        
        // If log has lot number, try to restore/revert to that specific lot
        if (log.lot && log.lot.trim()) {
          const [lots] = await connection.query(
            'SELECT lot_id, length_meters, length_yards FROM color_lots WHERE color_id = ? AND lot_number = ? FOR UPDATE',
            [log.color_id, log.lot.trim()]
          );
          
          if (lots.length > 0) {
            const lot = lots[0];
            const currentLotM = parseFloat(lot.length_meters) || 0;
            const currentLotY = parseFloat(lot.length_yards) || 0;
            
            let newLotM, newLotY;
            if (log.type === 'return') {
              // For return deletions: subtract from lot
              newLotM = Math.max(0, currentLotM - returnAmount);
              newLotY = Math.max(0, currentLotY - returnAmountYards);
            } else {
              // For sell/trim deletions: add back to lot
              newLotM = currentLotM + returnAmount;
              newLotY = currentLotY + returnAmountYards;
            }
            
            await connection.query(
              'UPDATE color_lots SET length_meters = ?, length_yards = ? WHERE lot_id = ?',
              [newLotM, newLotY, lot.lot_id]
            );
          }
        }
      }
    }

    // Step 3: Delete the log
    await connection.query('DELETE FROM logs WHERE log_id = ?', [logId]);

    // Step 4: Check if this was the last log in the transaction group
    let shouldDeleteGroup = false;
    let permitNumber = null;
    let transactionType = 'A';
    
    if (transactionGroupId) {
      const [remainingLogs] = await connection.query(
        'SELECT COUNT(*) as count FROM logs WHERE transaction_group_id = ?',
        [transactionGroupId]
      );
      
      if (remainingLogs[0].count === 0) {
        // Last log deleted, get transaction group info before deleting
        const [groups] = await connection.query(
          'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
          [transactionGroupId]
        );
        
        if (groups.length > 0) {
          shouldDeleteGroup = true;
          permitNumber = groups[0].permit_number;
          transactionType = groups[0].transaction_type || 'A';
          
          // Delete the transaction group
          await connection.query(
            'DELETE FROM transaction_groups WHERE transaction_group_id = ?',
            [transactionGroupId]
          );
        }
      } else {
        // Update transaction group totals
        const [groups] = await connection.query(
          'SELECT total_items, total_meters FROM transaction_groups WHERE transaction_group_id = ?',
          [transactionGroupId]
        );
        
        if (groups.length > 0) {
          const group = groups[0];
          const newTotalItems = Math.max(0, group.total_items - 1);
          const newTotalMeters = Math.max(0, parseFloat(group.total_meters) - returnAmount);
          
          await connection.query(
            'UPDATE transaction_groups SET total_items = ?, total_meters = ? WHERE transaction_group_id = ?',
            [newTotalItems, newTotalMeters, transactionGroupId]
          );
        }
      }
    }

    // Step 5: Decrease permit number counter if we deleted the last transaction group
    if (shouldDeleteGroup && permitNumber && permitNumber.match(/^[AB]-[0-9]+$/)) {
      const permitNum = parseInt(permitNumber.substring(2));
      
      // Find the highest permit number for this transaction type that is less than the canceled one
      const [result] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) as max_num 
         FROM transaction_groups 
         WHERE transaction_type = ? 
         AND permit_number IS NOT NULL 
         AND permit_number REGEXP ?
         AND CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) < ?`,
        [transactionType, `^${transactionType}-[0-9]+$`, permitNum]
      );
      
      const maxNum = result[0]?.max_num || 0;
      console.log(`Canceled log ${logId} from transaction group ${transactionGroupId} with permit ${permitNumber}. Next permit will be ${transactionType}-${maxNum + 1}`);
    }

    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Log canceled. Roll restored.${shouldDeleteGroup ? ' Transaction group deleted.' : ''}` 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error canceling log:', error);
    res.status(500).json({ error: 'Failed to cancel log: ' + error.message });
  } finally {
    connection.release();
  }
});

// POST /api/transactions/:transaction_group_id/cancel - Cancel entire transaction group
// Restores all rolls, deletes all logs, decreases permit number counter
app.post('/api/transactions/:transaction_group_id/cancel', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const transactionGroupId = req.params.transaction_group_id;
    
    await connection.beginTransaction();

    // Step 1: Get transaction group info
    const [groups] = await connection.query(
      'SELECT * FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );
    
    if (groups.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction group not found' });
    }
    
    const group = groups[0];
    const transactionType = group.transaction_type || 'A';
    const permitNumber = group.permit_number;

    // Step 2: Get all logs for this transaction group
    const [logs] = await connection.query(
      'SELECT * FROM logs WHERE transaction_group_id = ? ORDER BY epoch ASC',
      [transactionGroupId]
    );

    // Step 3: Restore/revert length to colors (and lots if applicable) - SAVE FIRST before deleting logs
    // Group by color_id to avoid multiple locks on same color
    const colorRestoreMap = {};
    
    for (const log of logs) {
      if ((log.type === 'sell' || log.type === 'trim' || log.type === 'return') && log.fabric_id && log.color_id) {
        const returnAmount = parseFloat(log.amount_meters) || 0;
        const logRollCount = parseInt(log.roll_count) || 0;
        
        if (returnAmount > 0) {
          const key = `${log.fabric_id}_${log.color_id}`;
          if (!colorRestoreMap[key]) {
            colorRestoreMap[key] = {
              fabric_id: log.fabric_id,
              color_id: log.color_id,
              totalAmount: 0,
              totalRollCount: 0,
              lots: {}, // Map of lot_number -> amount
              hasReturns: false // Track if any returns are in this group
            };
          }
          
          if (log.type === 'return') {
            // For returns: subtract (revert the return)
            colorRestoreMap[key].totalAmount -= returnAmount;
            colorRestoreMap[key].totalRollCount -= logRollCount;
            colorRestoreMap[key].hasReturns = true;
            
            // Track lot-specific amounts if lot number exists
            if (log.lot && log.lot.trim()) {
              const lotNum = log.lot.trim();
              if (!colorRestoreMap[key].lots[lotNum]) {
                colorRestoreMap[key].lots[lotNum] = 0;
              }
              colorRestoreMap[key].lots[lotNum] -= returnAmount;
            }
          } else {
            // For sell/trim: add back
            colorRestoreMap[key].totalAmount += returnAmount;
            colorRestoreMap[key].totalRollCount += logRollCount;
            
            // Track lot-specific amounts if lot number exists
            if (log.lot && log.lot.trim()) {
              const lotNum = log.lot.trim();
              if (!colorRestoreMap[key].lots[lotNum]) {
                colorRestoreMap[key].lots[lotNum] = 0;
              }
              colorRestoreMap[key].lots[lotNum] += returnAmount;
            }
          }
        }
      }
    }
    
    // Restore/revert to each color
    for (const key in colorRestoreMap) {
      const restore = colorRestoreMap[key];
      const returnAmount = restore.totalAmount;
      const returnAmountYards = returnAmount * 1.0936;
      const returnRollCount = restore.totalRollCount;
      
      // Get color with lock
      const [colors] = await connection.query(
        'SELECT color_id, fabric_id, length_meters, length_yards, roll_count FROM colors WHERE color_id = ? AND fabric_id = ? FOR UPDATE',
        [restore.color_id, restore.fabric_id]
      );
      
      if (colors.length > 0) {
        const color = colors[0];
        const currentMeters = parseFloat(color.length_meters) || 0;
        const currentYards = parseFloat(color.length_yards) || 0;
        const currentRollCount = parseInt(color.roll_count) || 0;
        
        // Apply net change (could be positive for sell/trim deletions, negative for return deletions)
        const newMeters = Math.max(0, currentMeters + returnAmount);
        const newYards = Math.max(0, currentYards + returnAmountYards);
        const newRollCount = Math.max(0, currentRollCount + returnRollCount);
        
        // Get old record for audit
        const [oldColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [restore.color_id]);
        const oldColorRecord = oldColorRows.length > 0 ? oldColorRows[0] : null;

        await connection.query(
          'UPDATE colors SET length_meters = ?, length_yards = ?, roll_count = ?, sold = 0 WHERE color_id = ?',
          [newMeters, newYards, newRollCount, restore.color_id]
        );

        // Get updated record for audit
        const [newColorRows] = await connection.query('SELECT * FROM colors WHERE color_id = ?', [restore.color_id]);
        const newColorRecord = newColorRows[0];
        
        // Log audit entry for transaction group cancellation
        if (oldColorRecord) {
          const action = restore.hasReturns ? 'Cancelled transaction group (mixed)' : 'Cancelled transaction group';
          await logUpdate('colors', restore.color_id, req.user, oldColorRecord, newColorRecord, req, `${action} - restored ${returnAmountYards.toFixed(2)}yd/${returnAmount.toFixed(2)}m`);
        }
        
        // Restore/revert to specific lots if applicable
        for (const lotNum in restore.lots) {
          const lotAmount = restore.lots[lotNum];
          const lotAmountYards = lotAmount * 1.0936;
          
          const [lots] = await connection.query(
            'SELECT lot_id, length_meters, length_yards FROM color_lots WHERE color_id = ? AND lot_number = ? FOR UPDATE',
            [restore.color_id, lotNum]
          );
          
          if (lots.length > 0) {
            const lot = lots[0];
            const currentLotM = parseFloat(lot.length_meters) || 0;
            const currentLotY = parseFloat(lot.length_yards) || 0;
            // Apply net change (could be positive or negative)
            const newLotM = Math.max(0, currentLotM + lotAmount);
            const newLotY = Math.max(0, currentLotY + lotAmountYards);
            
            await connection.query(
              'UPDATE color_lots SET length_meters = ?, length_yards = ? WHERE lot_id = ?',
              [newLotM, newLotY, lot.lot_id]
            );
          }
        }
      }
    }

    // Step 4: Delete all logs for this transaction group
    await connection.query(
      'DELETE FROM logs WHERE transaction_group_id = ?',
      [transactionGroupId]
    );

    // Step 5: Delete the transaction group
    await connection.query(
      'DELETE FROM transaction_groups WHERE transaction_group_id = ?',
      [transactionGroupId]
    );

    // Step 6: Decrease permit number counter if permit number matches pattern
    if (permitNumber && permitNumber.match(/^[AB]-[0-9]+$/)) {
      const permitNum = parseInt(permitNumber.substring(2));
      
      // Find the highest permit number for this transaction type that is less than the canceled one
      const [result] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) as max_num 
         FROM transaction_groups 
         WHERE transaction_type = ? 
         AND permit_number IS NOT NULL 
         AND permit_number REGEXP ?
         AND CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) < ?`,
        [transactionType, `^${transactionType}-[0-9]+$`, permitNum]
      );
      
      const maxNum = result[0]?.max_num || 0;
      
      // If there are no permit numbers below this one, we don't need to do anything
      // The counter will naturally continue from the next highest number
      // But if we want to "reuse" the canceled permit number, we could update the highest one
      // For now, we'll just let it continue naturally (the canceled number is skipped)
      console.log(`Canceled transaction ${transactionGroupId} with permit ${permitNumber}. Next permit will be ${transactionType}-${maxNum + 1}`);
    }

    await connection.commit();
    
    res.json({ 
      success: true, 
      message: `Transaction ${transactionGroupId} canceled. ${logs.length} logs deleted, rolls restored.` 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error canceling transaction:', error);
    res.status(500).json({ error: 'Failed to cancel transaction: ' + error.message });
  } finally {
    connection.release();
  }
});

// ============================================
// SALESPERSON MANAGEMENT ENDPOINTS
// ============================================

// GET /api/salespersons - List all salespersons
app.get('/api/salespersons', authMiddleware, async (req, res) => {
  try {
    const { active } = req.query;
    let query = `SELECT s.*,
      u_created.username as created_by_username, u_created.full_name as created_by_full_name,
      u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM salespersons s
      LEFT JOIN users u_created ON s.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON s.updated_by_user_id = u_updated.user_id`;
    const params = [];
    
    if (active !== undefined) {
      query += ' WHERE active = ?';
      params.push(active === 'true' || active === '1');
    }
    
    query += ' ORDER BY name ASC';
    
    const [salespersons] = await db.query(query, params);
    res.json(salespersons);
  } catch (error) {
    console.error('Error fetching salespersons:', error);
    res.status(500).json({ error: 'Failed to fetch salespersons' });
  }
});

// POST /api/salespersons - Create new salesperson
app.post('/api/salespersons', authMiddleware, async (req, res) => {
  try {
    const { name, code, email, phone, active = true } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Salesperson name is required' });
    }
    
    // Check if code already exists (if provided)
    if (code) {
      const [existing] = await db.query('SELECT salesperson_id FROM salespersons WHERE code = ?', [code]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Salesperson code already exists' });
      }
    }
    
    const userId = req.user ? req.user.user_id : null;
    const [result] = await db.query(
      'INSERT INTO salespersons (name, code, email, phone, active, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), code || null, email || null, phone || null, Boolean(active), userId]
    );
    
    const [newSalesperson] = await db.query(`
      SELECT s.*,
        u_created.username as created_by_username, u_created.full_name as created_by_full_name,
        u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM salespersons s
      LEFT JOIN users u_created ON s.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON s.updated_by_user_id = u_updated.user_id
      WHERE s.salesperson_id = ?
    `, [result.insertId]);
    
    // Log audit entry
    const [salespersonRow] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [result.insertId]);
    await logInsert('salespersons', result.insertId, req.user, salespersonRow[0], req, `Created salesperson: ${name.trim()}`);
    
    res.status(201).json(newSalesperson[0]);
  } catch (error) {
    console.error('Error creating salesperson:', error);
    res.status(500).json({ error: 'Failed to create salesperson' });
  }
});

// PUT /api/salespersons/:id - Update salesperson
app.put('/api/salespersons/:id', authMiddleware, async (req, res) => {
  try {
    const salespersonId = parseInt(req.params.id);
    const { name, code, email, phone, active } = req.body;
    
    const updates = {};
    const values = [];
    
    if (name !== undefined) {
      updates.name = name.trim();
      values.push(name.trim());
    }
    if (code !== undefined) {
      // Check if code is taken by another salesperson
      const [existing] = await db.query('SELECT salesperson_id FROM salespersons WHERE code = ? AND salesperson_id != ?', [code, salespersonId]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Salesperson code already exists' });
      }
      updates.code = code;
      values.push(code || null);
    }
    if (email !== undefined) {
      updates.email = email;
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.phone = phone;
      values.push(phone || null);
    }
    if (active !== undefined) {
      updates.active = Boolean(active);
      values.push(Boolean(active));
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // Get old record before update
    const [oldSalespersonRows] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
    if (oldSalespersonRows.length === 0) return res.status(404).json({ error: 'Salesperson not found' });
    const oldSalespersonRecord = oldSalespersonRows[0];

    const userId = req.user ? req.user.user_id : null;
    updates.updated_by_user_id = userId;
    values.push(salespersonId);
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.query(`UPDATE salespersons SET ${fields} WHERE salesperson_id = ?`, values);
    
    const [updated] = await db.query(`
      SELECT s.*,
        u_created.username as created_by_username, u_created.full_name as created_by_full_name,
        u_updated.username as updated_by_username, u_updated.full_name as updated_by_full_name
      FROM salespersons s
      LEFT JOIN users u_created ON s.created_by_user_id = u_created.user_id
      LEFT JOIN users u_updated ON s.updated_by_user_id = u_updated.user_id
      WHERE s.salesperson_id = ?
    `, [salespersonId]);
    
    // Get updated record for audit
    const [newSalespersonRows] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
    await logUpdate('salespersons', salespersonId, req.user, oldSalespersonRecord, newSalespersonRows[0], req, `Updated salesperson: ${newSalespersonRows[0].name}`);
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating salesperson:', error);
    res.status(500).json({ error: 'Failed to update salesperson' });
  }
});

// DELETE /api/salespersons/:id - Delete salesperson (soft delete by setting active = false, or hard delete)
app.delete('/api/salespersons/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const salespersonId = parseInt(req.params.id);
    
    // Check if salesperson has transactions
    const [hasTransactions] = await db.query('SELECT COUNT(*) as count FROM logs WHERE salesperson_id = ?', [salespersonId]);
    
    // Get old record before update/delete
    const [oldSalespersonRows] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
    if (oldSalespersonRows.length === 0) {
      return res.status(404).json({ error: 'Salesperson not found' });
    }
    const oldSalespersonRecord = oldSalespersonRows[0];
    
    if (hasTransactions[0].count > 0) {
      // Soft delete - set active to false
      await db.query('UPDATE salespersons SET active = FALSE WHERE salesperson_id = ?', [salespersonId]);
      
      // Get updated record for audit
      const [newSalespersonRows] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
      await logUpdate('salespersons', salespersonId, req.user, oldSalespersonRecord, newSalespersonRows[0], req, `Deactivated salesperson: ${oldSalespersonRecord.name}`);
      
      res.json({ success: true, message: 'Salesperson deactivated (has transactions)' });
    } else {
      // Hard delete - no transactions exist
      // Get record before deletion
      const [oldSalespersonRows] = await db.query('SELECT * FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
      if (oldSalespersonRows.length > 0) {
        await logDelete('salespersons', salespersonId, req.user, oldSalespersonRows[0], req, `Deleted salesperson: ${oldSalespersonRows[0].name}`);
      }
      await db.query('DELETE FROM salespersons WHERE salesperson_id = ?', [salespersonId]);
      res.json({ success: true, message: 'Salesperson deleted' });
    }
  } catch (error) {
    console.error('Error deleting salesperson:', error);
    res.status(500).json({ error: 'Failed to delete salesperson' });
  }
});

// GET /api/salespersons/stats - Get top sellers statistics
app.get('/api/salespersons/stats', authMiddleware, async (req, res) => {
  try {
    const { limit = 10, start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date) {
      dateFilter += ' AND l.epoch >= ?';
      params.push(parseInt(start_date));
    }
    if (end_date) {
      dateFilter += ' AND l.epoch <= ?';
      params.push(parseInt(end_date));
    }
    
    // Get top sellers by transaction count and total meters
    const query = `
      SELECT 
        s.salesperson_id,
        s.name,
        s.code,
        COUNT(l.log_id) as transaction_count,
        SUM(CASE WHEN l.type IN ('sell', 'trim') THEN l.amount_meters ELSE 0 END) as total_meters_sold,
        SUM(CASE WHEN l.type = 'sell' THEN 1 ELSE 0 END) as full_sales_count,
        SUM(CASE WHEN l.type = 'trim' THEN 1 ELSE 0 END) as trim_count
      FROM salespersons s
      LEFT JOIN logs l ON s.salesperson_id = l.salesperson_id AND l.type IN ('sell', 'trim') ${dateFilter}
      WHERE s.active = TRUE
      GROUP BY s.salesperson_id, s.name, s.code
      HAVING transaction_count > 0
      ORDER BY transaction_count DESC, total_meters_sold DESC
      LIMIT ?
    `;
    
    params.push(parseInt(limit));
    
    const [stats] = await db.query(query, params);
    res.json(stats.map(row => ({
      salesperson_id: row.salesperson_id,
      name: row.name,
      code: row.code,
      transaction_count: parseInt(row.transaction_count) || 0,
      total_meters_sold: parseFloat(row.total_meters_sold) || 0,
      full_sales_count: parseInt(row.full_sales_count) || 0,
      trim_count: parseInt(row.trim_count) || 0
    })));
  } catch (error) {
    console.error('Error fetching salesperson stats:', error);
    res.status(500).json({ error: 'Failed to fetch salesperson statistics' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'RisetexCo API is running' });
});

// Monthly sales report endpoint
app.get('/api/reports/monthly-sales', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    let query = `
      SELECT 
        DATE_FORMAT(FROM_UNIXTIME(l.epoch / 1000), '%Y-%m') as month,
        l.type,
        COUNT(*) as transaction_count,
        SUM(l.amount_meters) as total_meters,
        SUM(l.amount_meters * 1.0936) as total_yards,
        SUM(COALESCE(l.roll_count, 0)) as total_rolls
      FROM logs l
      WHERE l.type IN ('sell', 'trim', 'return')
    `;
    const params = [];
    
    if (year) {
      query += ' AND YEAR(FROM_UNIXTIME(l.epoch / 1000)) = ?';
      params.push(parseInt(year));
    }
    if (month) {
      query += ' AND MONTH(FROM_UNIXTIME(l.epoch / 1000)) = ?';
      params.push(parseInt(month));
    }
    
    query += ' GROUP BY month, l.type ORDER BY month DESC, l.type';
    
    const [results] = await db.query(query, params);
    
    // Group by month
    const monthlyData = {};
    results.forEach(row => {
      if (!monthlyData[row.month]) {
        monthlyData[row.month] = {
          month: row.month,
          sell: { count: 0, meters: 0, yards: 0, rolls: 0 },
          trim: { count: 0, meters: 0, yards: 0, rolls: 0 },
          return: { count: 0, meters: 0, yards: 0, rolls: 0 }
        };
      }
      // Update the type data
      if (monthlyData[row.month][row.type]) {
        monthlyData[row.month][row.type] = {
          count: row.transaction_count,
          meters: parseFloat(row.total_meters || 0),
          yards: parseFloat(row.total_yards || 0),
          rolls: parseInt(row.total_rolls || 0)
        };
      }
    });
    
    res.json(Object.values(monthlyData));
  } catch (error) {
    console.error('Error fetching monthly sales report:', error);
    res.status(500).json({ error: 'Failed to fetch monthly sales report' });
  }
});

// ============================================
// AUDIT LOGS ENDPOINT (Admin Only)
// ============================================

// GET /api/audit-logs - Get audit logs (admin only)
app.get('/api/audit-logs', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Check if audit_logs table exists
    try {
      await db.query('SELECT 1 FROM audit_logs LIMIT 1');
    } catch (tableError) {
      if (tableError.code === 'ER_NO_SUCH_TABLE' || tableError.message?.includes("doesn't exist")) {
        return res.status(503).json({ 
          error: 'Audit logs table does not exist. Please run the migration: backend/migrate-audit-logs.sql',
          migration_required: true
        });
      }
      throw tableError;
    }

    const {
      table_name,
      record_id,
      action,
      user_id,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        a.*,
        u.full_name as user_full_name,
        u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (table_name) {
      query += ' AND a.table_name = ?';
      params.push(table_name);
    }

    if (record_id) {
      query += ' AND a.record_id = ?';
      params.push(parseInt(record_id));
    }

    if (action) {
      query += ' AND a.action = ?';
      params.push(action);
    }

    if (user_id) {
      query += ' AND a.user_id = ?';
      params.push(parseInt(user_id));
    }

    if (start_date) {
      query += ' AND a.created_at >= ?';
      params.push(new Date(parseInt(start_date)).toISOString());
    }

    if (end_date) {
      query += ' AND a.created_at <= ?';
      params.push(new Date(parseInt(end_date)).toISOString());
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    const limitInt = parseInt(limit) || 100;
    const offsetInt = parseInt(offset) || 0;
    params.push(limitInt, offsetInt);

    const [logs] = await db.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    const countParams = [];
    if (table_name) { countQuery += ' AND table_name = ?'; countParams.push(table_name); }
    if (record_id) { countQuery += ' AND record_id = ?'; countParams.push(parseInt(record_id)); }
    if (action) { countQuery += ' AND action = ?'; countParams.push(action); }
    if (user_id) { countQuery += ' AND user_id = ?'; countParams.push(parseInt(user_id)); }
    if (start_date) { countQuery += ' AND created_at >= ?'; countParams.push(new Date(parseInt(start_date)).toISOString()); }
    if (end_date) { countQuery += ' AND created_at <= ?'; countParams.push(new Date(parseInt(end_date)).toISOString()); }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    // Parse JSON changes if present
    const formattedLogs = logs.map(log => {
      try {
        return {
          ...log,
          changes: log.changes ? (typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes) : null
        };
      } catch (parseError) {
        console.error('Error parsing changes JSON for audit log:', log.audit_id, parseError);
        return {
          ...log,
          changes: null
        };
      }
    });

    res.json({
      logs: formattedLogs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    // Provide more detailed error information
    let errorMessage = error.message || 'Failed to fetch audit logs';
    
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
      errorMessage = 'Audit logs table does not exist. Please run the migration: backend/migrate-audit-logs.sql';
    } else if (error.code === 'ER_BAD_FIELD_ERROR') {
      errorMessage = `Database column error: ${error.message}. The audit_logs table structure may be incorrect.`;
    } else if (error.code === 'ER_PARSE_ERROR') {
      errorMessage = `SQL syntax error: ${error.message}`;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/audit-logs/statistics - Get audit log statistics (admin only)
app.get('/api/audit-logs/statistics', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    // Check if audit_logs table exists
    try {
      await db.query('SELECT 1 FROM audit_logs LIMIT 1');
    } catch (tableError) {
      if (tableError.code === 'ER_NO_SUCH_TABLE' || tableError.message?.includes("doesn't exist")) {
        return res.status(503).json({ 
          error: 'Audit logs table does not exist. Please run the migration: backend/migrate-audit-logs.sql',
          migration_required: true
        });
      }
      throw tableError;
    }

    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [];

    if (start_date) {
      dateFilter += ' AND created_at >= ?';
      params.push(new Date(parseInt(start_date)).toISOString());
    }
    if (end_date) {
      dateFilter += ' AND created_at <= ?';
      params.push(new Date(parseInt(end_date)).toISOString());
    }

    // Most active users
    const [activeUsers] = await db.query(`
      SELECT 
        a.user_id,
        u.username,
        u.full_name,
        COUNT(*) as action_count
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE 1=1 ${dateFilter}
      GROUP BY a.user_id, u.username, u.full_name
      ORDER BY action_count DESC
      LIMIT 10
    `, params);

    // Most changed tables
    const [activeTables] = await db.query(`
      SELECT 
        table_name,
        COUNT(*) as change_count,
        SUM(CASE WHEN action = 'INSERT' THEN 1 ELSE 0 END) as inserts,
        SUM(CASE WHEN action = 'UPDATE' THEN 1 ELSE 0 END) as updates,
        SUM(CASE WHEN action = 'DELETE' THEN 1 ELSE 0 END) as deletes
      FROM audit_logs
      WHERE 1=1 ${dateFilter}
      GROUP BY table_name
      ORDER BY change_count DESC
    `, params);

    // Actions by hour (for activity pattern)
    const [hourlyActivity] = await db.query(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as action_count
      FROM audit_logs
      WHERE 1=1 ${dateFilter}
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `, params);

    // Recent activity (last 7 days)
    const [recentActivity] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as action_count
      FROM audit_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ${dateFilter ? 'AND' + dateFilter.replace('AND', '') : ''}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, params);

    res.json({
      activeUsers,
      activeTables,
      hourlyActivity,
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

///TEST

app.get("/api/db-health", async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    res.json({ db: "connected" });
  } catch (err) {
    res.status(500).json({
      db: "disconnected",
      error: err.message
    });
  }
});

// Serve built frontend if available so the app can run from one server
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  console.warn('frontend/dist not found. Run the frontend build to serve the UI.');
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`Server listening on port ${PORT || 'undefined'} (env: ${env})`);
  console.log('Elastic Beanstalk/ALB ready to proxy traffic.');
});