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
    const [rolls] = await db.query('SELECT * FROM rolls ORDER BY color_id, roll_id');

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
          formattedDate = null;
        }
      }
      // If still null (shouldn't happen for new rolls, but handle gracefully)
      if (!formattedDate) {
        formattedDate = new Date().toISOString().split('T')[0];
      }
      
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

// Get single fabric by index (0-based array position)
const getFabricByIndex = async (index) => {
  const fabrics = await buildFabricStructure();
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
      'SELECT roll_id, color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status FROM rolls'
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
        await connection.query(
          'UPDATE fabrics SET fabric_name = ?, fabric_code = ?, main_code = ?, source = ?, design = ? WHERE fabric_id = ?',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code || null, fabric.source, fabric.design, fabricId]
        );
        processedFabricIds.add(fabricId);
      } else if (fabric.main_code && existingFabricsByMainCode.has(fabric.main_code)) {
        // UPDATE by main_code if no fabric_id provided
        fabricId = existingFabricsByMainCode.get(fabric.main_code);
        await connection.query(
          'UPDATE fabrics SET fabric_name = ?, fabric_code = ?, main_code = ?, source = ?, design = ? WHERE fabric_id = ?',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code, fabric.source, fabric.design, fabricId]
        );
        processedFabricIds.add(fabricId);
      } else {
        // INSERT new fabric
        const [result] = await connection.query(
          'INSERT INTO fabrics (fabric_name, fabric_code, main_code, source, design) VALUES (?, ?, ?, ?, ?)',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code || null, fabric.source, fabric.design]
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
          await connection.query(
            'UPDATE colors SET color_name = ? WHERE color_id = ?',
            [color.color_name, colorId]
          );
          processedColorIds.add(colorId);
        } else {
          // INSERT new color
          const [result] = await connection.query(
            'INSERT INTO colors (fabric_id, color_name) VALUES (?, ?)',
            [fabricId, color.color_name]
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
            status: roll.status || 'available'
          };

          if (targetRollId && existingRollIds.has(targetRollId)) {
            await connection.query(
              'UPDATE rolls SET date = ?, length_meters = ?, length_yards = ?, is_trimmable = ?, weight = ?, status = ? WHERE roll_id = ?',
              [rollPayload.date, rollPayload.length_meters, rollPayload.length_yards, rollPayload.is_trimmable, rollPayload.weight, rollPayload.status, targetRollId]
            );
            processedRollIds.add(targetRollId);
          } else {
            const [result] = await connection.query(
              'INSERT INTO rolls (color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [colorId, fabricId, rollPayload.date, rollPayload.length_meters, rollPayload.length_yards, rollPayload.is_trimmable, rollPayload.weight, rollPayload.status]
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

// Helper to get Lebanon-local timestamp (ISO-like) and epoch ms
function getLebanonTimestamp(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('sv', {
    timeZone: 'Asia/Beirut',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // fmt.format returns "YYYY-MM-DD HH:mm:ss" in the specified timezone
  const formatted = fmt.format(date);
  const iso = formatted.replace(' ', 'T');
  return { iso, epoch: date.valueOf(), tz: 'Asia/Beirut' };
}

// Helper to create or update transaction group
// Called within a database transaction, expects a connection
async function createOrUpdateTransactionGroup(connection, transactionGroupId, customerId, customerName, notes, amountMeters) {
  if (!transactionGroupId) return;
  
  const now = getLebanonTimestamp();
  
  // Check if transaction group already exists
  const [existing] = await connection.query(
    'SELECT transaction_group_id, total_items, total_meters, notes FROM transaction_groups WHERE transaction_group_id = ?',
    [transactionGroupId]
  );
  
  if (existing.length === 0) {
    // Create new transaction group
    await connection.query(
      'INSERT INTO transaction_groups (transaction_group_id, customer_id, customer_name, transaction_date, epoch, timezone, total_items, total_meters, notes) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
      [transactionGroupId, customerId || null, customerName || null, now.iso, now.epoch, now.tz, amountMeters, notes || null]
    );
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
    res.status(500).json({ error: 'Failed to login' });
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

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
    await db.query(sql, values);

    const [updated] = await db.query(
      'SELECT user_id, username, email, role, full_name, created_at, updated_at FROM users WHERE user_id = ?',
      [userId]
    );

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

    await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
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
    res.status(500).json({ error: 'Failed to fetch deletion requests' });
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
    let sql = 'SELECT * FROM customers';
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
    const [result] = await db.query(
      'INSERT INTO customers (customer_name, phone, email, notes) VALUES (?, ?, ?, ?)',
      [name.trim(), phone || null, email || null, notes || null]
    );
    const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [result.insertId]);
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

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id];
    await db.query(`UPDATE customers SET ${fields} WHERE customer_id = ?`, values);

    const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomer(rows[0]));
  } catch (error) {
    console.error('Error updating customer:', error.message, error.code);
    res.status(500).json({ error: error.message || 'Failed to update customer' });
  }
});

app.delete('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    // Check if customer has associated logs
    const [logs] = await db.query('SELECT COUNT(*) as count FROM logs WHERE customer_id = ?', [req.params.id]);
    
    if (logs[0].count > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete customer with transaction history',
        detail: `This customer has ${logs[0].count} transaction(s). Consider archiving instead.`
      });
    }

    const [result] = await db.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error.message, error.code);
    res.status(500).json({ error: error.message || 'Failed to delete customer' });
  }
});

// ============================================
// FABRICS ENDPOINTS (ID-based, not index-based)
// ============================================

// GET all fabrics
app.get('/api/fabrics', authMiddleware, async (req, res) => {
  try {
    const fabrics = await buildFabricStructure();
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

    // Build full structure for this fabric
    const fabrics = await buildFabricStructure();
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
    const [result] = await db.query(
      'INSERT INTO fabrics (fabric_name, fabric_code, main_code, source, design) VALUES (?, ?, ?, ?, ?)',
      [fabric_name.trim(), fabric_code, main_code || null, source || null, design || 'none']
    );

    // Return what DB actually created
    const fabrics = await buildFabricStructure();
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

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), fabricId];
    
    await db.query(`UPDATE fabrics SET ${fields} WHERE fabric_id = ?`, values);

    // Return DB reality after update
    const fabrics = await buildFabricStructure();
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

    // IMPORTANT: Do NOT delete logs - they are append-only audit records
    // Logs will have fabric_id set to NULL via ON DELETE SET NULL constraint
    // Cascade delete: rolls -> colors -> fabric (logs preserved)
    await connection.query('DELETE FROM rolls WHERE fabric_id = ?', [fabricId]);
    await connection.query('DELETE FROM colors WHERE fabric_id = ?', [fabricId]);
    await connection.query('DELETE FROM fabrics WHERE fabric_id = ?', [fabricId]);

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

    // Check if color exists
    const [existing] = await connection.query('SELECT color_id FROM colors WHERE color_id = ?', [colorId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }

    // Cascade delete: rolls -> color
    await connection.query('DELETE FROM rolls WHERE color_id = ?', [colorId]);
    await connection.query('DELETE FROM colors WHERE color_id = ?', [colorId]);

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

// DELETE roll by roll_id
app.delete('/api/rolls/:roll_id', authMiddleware, requireRole('admin'), async (req, res) => {
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
});

// PUT bulk update - DEPRECATED: Use granular endpoints instead
// Kept for backward compatibility but should be phased out
app.put('/api/fabrics', authMiddleware, async (req, res) => {
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
    
    // Return DB state
    const updated = await buildFabricStructure();
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
    const { color_name } = req.body;

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

    // Check for duplicate color name (enforced by unique constraint)
    const [existing] = await connection.query(
      'SELECT color_id FROM colors WHERE fabric_id = ? AND color_name = ?',
      [fabricId, color_name.trim()]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Color name already exists for this fabric' });
    }

    // Insert color
    const [result] = await connection.query(
      'INSERT INTO colors (fabric_id, color_name) VALUES (?, ?)',
      [fabricId, color_name.trim()]
    );

    await connection.commit();

    // Return full fabric structure with new color
    const fabrics = await buildFabricStructure();
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

// PUT /api/colors/:color_id - Update color name
app.put('/api/colors/:color_id', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const { color_name } = req.body;

    if (!color_name || !color_name.trim()) {
      return res.status(400).json({ error: 'Color name is required' });
    }

    await connection.beginTransaction();

    // Check color exists and get fabric_id
    const [colors] = await connection.query(
      'SELECT color_id, fabric_id FROM colors WHERE color_id = ?',
      [colorId]
    );
    if (colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    const fabricId = colors[0].fabric_id;

    // Check for duplicate color name (excluding current color)
    const [existing] = await connection.query(
      'SELECT color_id FROM colors WHERE fabric_id = ? AND color_name = ? AND color_id != ?',
      [fabricId, color_name.trim(), colorId]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Color name already exists for this fabric' });
    }

    // Update color name
    await connection.query(
      'UPDATE colors SET color_name = ? WHERE color_id = ?',
      [color_name.trim(), colorId]
    );

    await connection.commit();

    // Return full fabric structure with updated color
    const fabrics = await buildFabricStructure();
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

// POST /api/colors/:color_id/rolls - Add roll to color
app.post('/api/colors/:color_id/rolls', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const colorId = parseInt(req.params.color_id);
    const { date, length_meters, length_yards, is_trimmable, weight } = req.body;

    // Validation - date will default to today if not provided
    const lenM = parseFloat(length_meters);
    const lenY = parseFloat(length_yards);
    if (isNaN(lenM) || lenM < 0 || isNaN(lenY) || lenY < 0) {
      return res.status(400).json({ error: 'Valid length in meters and yards is required' });
    }

    await connection.beginTransaction();

    // Get color and fabric_id
    const [colors] = await connection.query(
      'SELECT color_id, fabric_id FROM colors WHERE color_id = ?',
      [colorId]
    );
    if (colors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Color not found' });
    }
    const fabricId = colors[0].fabric_id;

    // Insert roll - ensure date is valid, use today if missing
    const rollDate = date && date.trim() ? date.trim() : new Date().toISOString().split('T')[0];
    const [result] = await connection.query(
      'INSERT INTO rolls (color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [colorId, fabricId, rollDate, lenM, lenY, Boolean(is_trimmable), weight || 'N/A', 'available']
    );

    await connection.commit();

    // Return full fabric structure with new roll
    const fabrics = await buildFabricStructure();
    const updatedFabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!updatedFabric) {
      return res.status(404).json({ error: 'Fabric not found after roll creation' });
    }

    res.status(201).json(updatedFabric);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating roll:', error);
    res.status(500).json({ error: error.message || 'Failed to create roll' });
  } finally {
    connection.release();
  }
});

// PUT /api/rolls/:roll_id - Update roll (length, date, weight, etc.) - Admin only
app.put('/api/rolls/:roll_id', authMiddleware, requireRole('admin'), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    const { date, length_meters, length_yards, is_trimmable, weight } = req.body;

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
      updates.date = date;
      values.push(date);
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

    if (Object.keys(updates).length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No fields to update' });
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    values.push(rollId);
    
    await connection.query(`UPDATE rolls SET ${fields} WHERE roll_id = ?`, values);

    await connection.commit();

    // Return updated roll in fabric structure
    const fabrics = await buildFabricStructure();
    for (const fabric of fabrics) {
      for (const color of fabric.colors || []) {
        const roll = (color.rolls || []).find(r => r.roll_id === rollId);
        if (roll) {
          return res.json(fabric);
        }
      }
    }

    res.status(404).json({ error: 'Roll not found in structure' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating roll:', error);
    res.status(500).json({ error: error.message || 'Failed to update roll' });
  } finally {
    connection.release();
  }
});

// POST /api/rolls/:roll_id/trim - Trim roll (transactional, creates log)
app.post('/api/rolls/:roll_id/trim', authMiddleware, async (req, res) => {
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
    const newLengthY = newLengthM * 1.09361;

    // Update roll (or delete if length becomes 0)
    if (newLengthM <= 0) {
      await connection.query('DELETE FROM rolls WHERE roll_id = ?', [rollId]);
    } else {
      await connection.query(
        'UPDATE rolls SET length_meters = ?, length_yards = ? WHERE roll_id = ?',
        [newLengthM, newLengthY, rollId]
      );
    }

    // Handle transaction group creation/update
    const transaction_group_id = req.body.transaction_group_id || null;
    if (transaction_group_id) {
      await createOrUpdateTransactionGroup(
        connection,
        transaction_group_id,
        customer_id,
        customer_name,
        notes,
        trimAmount
      );
    }

    // Create log entry
    const now = getLebanonTimestamp();
    await connection.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, transaction_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['trim', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, trimAmount, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz, transaction_group_id]
    );

    await connection.commit();

    // Return updated fabric structure
    const updatedFabrics = await buildFabricStructure();
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

// POST /api/rolls/:roll_id/sell - Sell roll (transactional, creates log)
app.post('/api/rolls/:roll_id/sell', authMiddleware, async (req, res) => {
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
    const rollLengthMeters = parseFloat(roll.length_meters);
    if (transaction_group_id) {
      await createOrUpdateTransactionGroup(
        connection,
        transaction_group_id,
        customer_id,
        customer_name,
        notes,
        rollLengthMeters
      );
    }

    // Create log entry BEFORE deleting roll
    const now = getLebanonTimestamp();
    await connection.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone, transaction_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['sell', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, rollLengthMeters, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz, transaction_group_id]
    );

    // Delete roll
    await connection.query('DELETE FROM rolls WHERE roll_id = ?', [rollId]);

    await connection.commit();

    // Return updated fabric structure
    const updatedFabrics = await buildFabricStructure();
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

// POST /api/rolls/:roll_id/return - Return roll (transactional, creates log, adds length back)
app.post('/api/rolls/:roll_id/return', authMiddleware, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const rollId = parseInt(req.params.roll_id);
    const { amount_meters, customer_id, customer_name, notes, timestamp, epoch } = req.body;

    // Validation
    const returnAmount = parseFloat(amount_meters);
    if (isNaN(returnAmount) || returnAmount <= 0) {
      return res.status(400).json({ error: 'Return amount must be a positive number' });
    }

    await connection.beginTransaction();

    // Get roll with lock (roll may not exist if it was sold, so we need to recreate it)
    const [rolls] = await connection.query(
      'SELECT roll_id, color_id, fabric_id, length_meters, length_yards, is_trimmable, weight FROM rolls WHERE roll_id = ? FOR UPDATE',
      [rollId]
    );

    let roll;
    let isNewRoll = false;

    if (rolls.length === 0) {
      // Roll doesn't exist (was sold), need to recreate it
      // Get color and fabric info from logs
      const [logData] = await connection.query(
        'SELECT fabric_id, color_id, is_trimmable, weight FROM logs WHERE roll_id = ? AND type = ? ORDER BY epoch DESC LIMIT 1',
        [rollId, 'sell']
      );
      
      if (logData.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Roll not found and no sell log found to recreate from' });
      }

      const log = logData[0];
      roll = {
        roll_id: rollId,
        color_id: log.color_id,
        fabric_id: log.fabric_id,
        length_meters: 0,
        length_yards: 0,
        is_trimmable: log.is_trimmable,
        weight: log.weight
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

    // Update or create roll
    const newLengthM = parseFloat(roll.length_meters) + returnAmount;
    const newLengthY = newLengthM * 1.09361;

    if (isNewRoll) {
      await connection.query(
        'INSERT INTO rolls (roll_id, color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status) VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)',
        [rollId, roll.color_id, roll.fabric_id, newLengthM, newLengthY, roll.is_trimmable, roll.weight || 'N/A', 'available']
      );
    } else {
      await connection.query(
        'UPDATE rolls SET length_meters = ?, length_yards = ? WHERE roll_id = ?',
        [newLengthM, newLengthY, rollId]
      );
    }

    // Create log entry
    const now = timestamp ? { iso: timestamp, epoch: epoch || Date.parse(timestamp.replace('T', ' ')), tz: 'Asia/Beirut' } : getLebanonTimestamp();
    await connection.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['return', rollId, roll.fabric_id, roll.color_id, fabric.fabric_name, color.color_name, customer_id || null, customer_name || null, returnAmount, roll.is_trimmable, roll.weight || 'N/A', notes || null, now.iso, now.epoch, now.tz]
    );

    await connection.commit();

    // Return updated fabric structure
    const updatedFabrics = await buildFabricStructure();
    const updatedFabric = updatedFabrics.find(f => f.fabric_id === roll.fabric_id);
    res.json(updatedFabric || updatedFabrics);
  } catch (error) {
    await connection.rollback();
    console.error('Error returning roll:', error);
    res.status(500).json({ error: error.message || 'Failed to return roll' });
  } finally {
    connection.release();
  }
});

// ============================================
// LOGS ENDPOINTS (Accept fabricIndex/colorIndex, store fabricId/colorId)
// ============================================

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { type, fabricId, colorId, rollId, start, end, minLength, maxLength } = req.query;
    
    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (fabricId) {
      query += ' AND fabric_id = ?';
      params.push(parseInt(fabricId));
    }
    if (colorId) {
      query += ' AND color_id = ?';
      params.push(parseInt(colorId));
    }
    if (rollId) {
      query += ' AND roll_id LIKE ?';
      params.push(`%${rollId}%`);
    }
    if (start) {
      query += ' AND epoch >= ?';
      params.push(parseInt(start));
    }
    if (end) {
      query += ' AND epoch <= ?';
      params.push(parseInt(end));
    }
    if (minLength) {
      query += ' AND amount_meters >= ?';
      params.push(parseFloat(minLength));
    }
    if (maxLength) {
      query += ' AND amount_meters <= ?';
      params.push(parseFloat(maxLength));
    }

    query += ' ORDER BY epoch DESC';

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
      is_trimmable: Boolean(log.is_trimmable),
      weight: log.weight,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      timezone: log.timezone,
      transaction_group_id: log.transaction_group_id || null,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // compatibility camelCase aliases
      id: log.log_id,
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
      transactionGroupId: log.transaction_group_id || null
    }));

    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/logs/:id', authMiddleware, async (req, res) => {
  try {
    const [logs] = await db.query('SELECT * FROM logs WHERE log_id = ?', [req.params.id]);
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
        length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
        tz: log.timezone,
        isTrimmable: Boolean(log.is_trimmable),
        transactionGroupId: log.transaction_group_id || null
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
    
    // Get all related logs
    const [logs] = await db.query(
      'SELECT * FROM logs WHERE transaction_group_id = ? ORDER BY epoch ASC',
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
      amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
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
      length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      transactionGroupId: log.transaction_group_id || null
    }));
    
    // Return transaction group with items
    res.json({
      transaction_group_id: group.transaction_group_id,
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
      timezone: 'Asia/Beirut'
    };

    const [result] = await db.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logData.type, logData.roll_id, logData.fabric_id, logData.color_id, logData.fabric_name, logData.color_name, logData.customer_id, logData.customer_name, logData.amount_meters, logData.is_trimmable, logData.weight, logData.notes, logData.timestamp, logData.epoch, logData.timezone]
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
    if (updates.timestamp !== undefined) updateData.timestamp = updates.timestamp;
    if (updates.epoch !== undefined) updateData.epoch = updates.epoch;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const fields = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updateData), logId];
    
    await db.query(`UPDATE logs SET ${fields} WHERE log_id = ?`, values);

    // Return DB reality
    const [updated] = await db.query('SELECT * FROM logs WHERE log_id = ?', [logId]);
    const log = updated[0];
    
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
    console.error('Error updating log:', error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

app.delete('/api/logs/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM logs WHERE log_id = ?', [req.params.id]);
    if (result.affectedRows > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'RisetexCo API is running' });
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