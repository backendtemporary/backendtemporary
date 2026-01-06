import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

import pool from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT;

app.get("/api/__prove", (req, res) => {
  res.send("PROVE ROUTE");
});


// Middleware
// CORS: allow localhost dev and EB HTTPS domain
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://risetexco-depot-prod.eba-3qgbu6pm.eu-north-1.elasticbeanstalk.com',
];

const isElasticBeanstalkDomain = (origin = '') => /https:\/\/.*\.elasticbeanstalk\.com$/i.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl/ALB health checks
    if (allowedOrigins.includes(origin) || isElasticBeanstalkDomain(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

// Root health checks for Elastic Beanstalk/ALB
app.get('/', (req, res) => {
  res.status(200).send('API is running');
});

app.get('/api', (req, res) => {
  res.status(200).send('API root');
});

// Authentication middleware must not block public health endpoints
// Replace `authMiddleware` with your real auth when ready
const authMiddleware = (req, res, next) => next();

app.use('/api', (req, res, next) => {
  if (req.path === '/' || req.path === '/health') return next();
  return authMiddleware(req, res, next);
});

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
      
      rollsByColor[roll.color_id].push({
        id: `FAB-${fabricNum}-COL-${colorNum}-ROL-${rollNum}`,
        date: roll.date,
        length_meters: parseFloat(roll.length_meters),
        length_yards: parseFloat(roll.length_yards),
        isTrimmable: Boolean(roll.is_trimmable),
        weight: roll.weight || 'N/A'
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
    const [existingFabrics] = await connection.query('SELECT fabric_id, fabric_code FROM fabrics');
    const [existingColors] = await connection.query('SELECT color_id, fabric_id, color_name FROM colors');
    const [existingRolls] = await connection.query('SELECT roll_id, color_id, fabric_id FROM rolls');

    const existingFabricIds = new Set(existingFabrics.map(f => f.fabric_id));
    const processedFabricIds = new Set();

    // Process each fabric
    for (const fabric of fabricsArray) {
      let fabricId = fabric.fabric_id;

      if (fabricId && existingFabricIds.has(fabricId)) {
        // UPDATE existing fabric
        await connection.query(
          'UPDATE fabrics SET fabric_name = ?, fabric_code = ?, main_code = ?, source = ?, design = ? WHERE fabric_id = ?',
          [fabric.fabric_name, fabric.fabric_code, fabric.main_code || null, fabric.source, fabric.design, fabricId]
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
        const existingRollIds = new Set(
          existingRolls.filter(r => r.color_id === colorId).map(r => r.roll_id)
        );
        const processedRollIds = new Set();

        for (const roll of color.rolls || []) {
          // Rolls are identified by their display ID (e.g., "FAB-001-COL-001-ROL-001")
          // Find matching roll by display ID format
          const [matchingRolls] = await connection.query(
            'SELECT roll_id FROM rolls WHERE color_id = ? AND fabric_id = ?',
            [colorId, fabricId]
          );
          
          // Try to find existing roll by position/order
          const rollIndex = color.rolls.indexOf(roll);
          const existingRoll = matchingRolls[rollIndex];

          if (existingRoll) {
            // UPDATE existing roll
            await connection.query(
              'UPDATE rolls SET date = ?, length_meters = ?, length_yards = ?, is_trimmable = ?, weight = ? WHERE roll_id = ?',
              [roll.date, roll.length_meters, roll.length_yards, roll.isTrimmable || false, roll.weight || 'N/A', existingRoll.roll_id]
            );
            processedRollIds.add(existingRoll.roll_id);
          } else {
            // INSERT new roll
            const [result] = await connection.query(
              'INSERT INTO rolls (color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [colorId, fabricId, roll.date, roll.length_meters, roll.length_yards, roll.isTrimmable || false, roll.weight || 'N/A', 'available']
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
// CUSTOMERS ENDPOINTS
// ============================================

app.get('/api/customers', async (req, res) => {
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

app.get('/api/customers/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomer(rows[0]));
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

app.post('/api/customers', async (req, res) => {
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

app.put('/api/customers/:id', async (req, res) => {
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

app.delete('/api/customers/:id', async (req, res) => {
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
app.get('/api/fabrics', async (req, res) => {
  try {
    const fabrics = await buildFabricStructure();
    res.json(fabrics);
  } catch (error) {
    console.error('Error fetching fabrics:', error);
    res.status(500).json({ error: 'Failed to fetch fabrics' });
  }
});

// GET single fabric by fabric_id (DB ID, not array index)
app.get('/api/fabrics/:fabric_id', async (req, res) => {
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
app.post('/api/fabrics', async (req, res) => {
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
app.put('/api/fabrics/:fabric_id', async (req, res) => {
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

// DELETE fabric by fabric_id with cascade
app.delete('/api/fabrics/:fabric_id', async (req, res) => {
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

    // Cascade delete: logs -> rolls -> colors -> fabric
    // First delete logs that reference rolls of this fabric
    await connection.query('DELETE FROM logs WHERE fabric_id = ?', [fabricId]);
    // Then delete rolls
    await connection.query('DELETE FROM rolls WHERE fabric_id = ?', [fabricId]);
    // Then delete colors
    await connection.query('DELETE FROM colors WHERE fabric_id = ?', [fabricId]);
    // Finally delete the fabric
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
app.delete('/api/colors/:color_id', async (req, res) => {
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
app.delete('/api/rolls/:roll_id', async (req, res) => {
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

// PUT bulk update (validates each fabric exists)
app.put('/api/fabrics', async (req, res) => {
  try {
    const fabricsArray = req.body;
    
    if (!Array.isArray(fabricsArray)) {
      return res.status(400).json({ error: 'Request body must be an array' });
    }

    // Validate all fabrics have IDs
    for (const fabric of fabricsArray) {
      if (!fabric.fabric_id) {
        return res.status(400).json({ error: 'All fabrics must have fabric_id for bulk update' });
      }
    }

    await saveFabricStructure(fabricsArray);
    
    // Return DB state
    const updated = await buildFabricStructure();
    res.json(updated);
  } catch (error) {
    console.error('Error updating fabrics:', error);
    res.status(500).json({ error: 'Failed to update fabrics' });
  }
});

// ============================================
// LOGS ENDPOINTS (Accept fabricIndex/colorIndex, store fabricId/colorId)
// ============================================

app.get('/api/logs', async (req, res) => {
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
    
    // Convert database format to JSON format (use DB IDs, not indices)
    const formattedLogs = logs.map(log => ({
      type: log.type,
      rollId: log.roll_id,
      amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      fabricId: log.fabric_id || null,
      colorId: log.color_id || null,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerId: log.customer_id || null,
      customerName: log.customer_name,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      id: log.log_id,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      weight: log.weight
    }));

    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/logs/:id', async (req, res) => {
  try {
    const [logs] = await db.query('SELECT * FROM logs WHERE log_id = ?', [req.params.id]);
    if (logs.length > 0) {
      const log = logs[0];
      res.json({
        type: log.type,
        rollId: log.roll_id,
        amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
        length_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
        fabricId: log.fabric_id || null,
        colorId: log.color_id || null,
        fabricName: log.fabric_name,
        colorName: log.color_name,
        customerId: log.customer_id || null,
        customerName: log.customer_name,
        notes: log.notes,
        timestamp: log.timestamp,
        epoch: log.epoch,
        id: log.log_id,
        tz: log.timezone,
        isTrimmable: Boolean(log.is_trimmable),
        weight: log.weight
      });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    console.error('Error fetching log:', error);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

app.post('/api/logs', async (req, res) => {
  try {
    const entry = req.body || {};
    const now = getLebanonTimestamp();
    
    // Validation
    if (!entry.type) {
      return res.status(400).json({ error: 'Log type is required' });
    }

    // Accept fabricIndex from frontend, store fabricId in DB
    let fabricId = entry.fabricId || entry.fabric_id;
    let colorId = entry.colorId || entry.color_id;

    // If frontend sends fabricIndex/colorIndex, resolve to IDs
    if ((fabricId === undefined || fabricId === null) && entry.fabricIndex !== undefined) {
      const fabrics = await buildFabricStructure();
      if (entry.fabricIndex >= 0 && entry.fabricIndex < fabrics.length) {
        fabricId = fabrics[entry.fabricIndex].fabric_id;
        
        if (entry.colorIndex !== undefined && fabrics[entry.fabricIndex].colors) {
          const colors = fabrics[entry.fabricIndex].colors;
          if (entry.colorIndex >= 0 && entry.colorIndex < colors.length) {
            colorId = colors[entry.colorIndex].color_id;
          }
        }
      }
    }

    if (!fabricId) {
      return res.status(400).json({ error: 'Fabric ID or index is required' });
    }

    // Validate roll_id exists if provided
    let rollId = entry.rollId || null;
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
      type: log.type,
      rollId: log.roll_id,
      amount_meters: parseFloat(log.amount_meters) || 0,
      length_meters: parseFloat(log.amount_meters) || 0,
      fabricId: log.fabric_id,
      colorId: log.color_id,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerId: log.customer_id,
      customerName: log.customer_name,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      id: log.log_id,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      weight: log.weight
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

app.put('/api/logs/:id', async (req, res) => {
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
      type: log.type,
      rollId: log.roll_id,
      amount_meters: parseFloat(log.amount_meters) || 0,
      fabricId: log.fabric_id,
      colorId: log.color_id,
      fabricName: log.fabric_name,
      colorName: log.color_name,
      customerId: log.customer_id,
      customerName: log.customer_name,
      notes: log.notes,
      timestamp: log.timestamp,
      epoch: log.epoch,
      id: log.log_id,
      tz: log.timezone,
      isTrimmable: Boolean(log.is_trimmable),
      weight: log.weight
    });
  } catch (error) {
    console.error('Error updating log:', error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

app.delete('/api/logs/:id', async (req, res) => {
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