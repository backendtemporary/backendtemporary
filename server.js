import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================

// Build nested fabric structure from database (fabrics -> colors -> rolls)
const buildFabricStructure = async () => {
  try {
    const [fabrics] = await db.query('SELECT * FROM fabrics ORDER BY fabric_id');
    const [colors] = await db.query('SELECT * FROM colors ORDER BY fabric_id, color_id');
    const [rolls] = await db.query('SELECT * FROM rolls ORDER BY color_id, roll_id');

    // Group rolls by color_id
    const rollsByColor = {};
    rolls.forEach(roll => {
      if (!rollsByColor[roll.color_id]) rollsByColor[roll.color_id] = [];
      rollsByColor[roll.color_id].push({
        id: `FAB-${String(roll.fabric_id).padStart(3, '0')}-COL-${String(roll.color_id).padStart(3, '0')}-ROL-${String(roll.roll_id).padStart(3, '0')}`,
        date: roll.date,
        length_meters: parseFloat(roll.length_meters),
        length_yards: parseFloat(roll.length_yards),
        isTrimmable: Boolean(roll.is_trimmable),
        weight: roll.weight || 'N/A'
      });
    });

    // Group colors by fabric_id
    const colorsByFabric = {};
    colors.forEach(color => {
      if (!colorsByFabric[color.fabric_id]) colorsByFabric[color.fabric_id] = [];
      colorsByFabric[color.fabric_id].push({
        color_id: color.color_id,
        fabric_id: color.fabric_id,
        id: `FAB-${String(color.fabric_id).padStart(3, '0')}-COL-${String(color.color_id).padStart(3, '0')}`,
        color_name: color.color_name,
        rolls: rollsByColor[color.color_id] || []
      });
    });

    // Build final structure with stable DB IDs for log integrity
    return fabrics.map(fabric => ({
      fabric_id: fabric.fabric_id,
      fabric_name: fabric.fabric_name,
      fabric_code: fabric.fabric_code,
      source: fabric.source,
      design: fabric.design,
      colors: colorsByFabric[fabric.fabric_id] || []
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

// Save complete fabric structure to database
const saveFabricStructure = async (fabricsArray) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Clear existing data
    // Logs clear must precede rolls/colors/fabrics to avoid FK issues if present
    await connection.query('DELETE FROM logs');
    await connection.query('DELETE FROM rolls');
    await connection.query('DELETE FROM colors');
    await connection.query('DELETE FROM fabrics');

    // Insert fabrics, colors, and rolls
    for (const fabric of fabricsArray) {
      const [fabricResult] = await connection.query(
        'INSERT INTO fabrics (fabric_name, fabric_code, source, design) VALUES (?, ?, ?, ?)',
        [fabric.fabric_name, fabric.fabric_code, fabric.source, fabric.design]
      );
      const fabricId = fabricResult.insertId;

      for (const color of fabric.colors || []) {
        const [colorResult] = await connection.query(
          'INSERT INTO colors (fabric_id, color_name) VALUES (?, ?)',
          [fabricId, color.color_name]
        );
        const colorId = colorResult.insertId;

        for (const roll of color.rolls || []) {
          await connection.query(
            'INSERT INTO rolls (color_id, fabric_id, date, length_meters, length_yards, is_trimmable, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [colorId, fabricId, roll.date, roll.length_meters, roll.length_yards, roll.isTrimmable || false, roll.weight || 'N/A', 'available']
          );
        }
      }
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
      sql += ' WHERE name LIKE ?';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY name ASC LIMIT 100';
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

// GET single fabric by index
app.get('/api/fabrics/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const fabric = await getFabricByIndex(index);
    if (fabric) {
      res.json(fabric);
    } else {
      res.status(404).json({ error: 'Fabric not found' });
    }
  } catch (error) {
    console.error('Error fetching fabric:', error);
    res.status(500).json({ error: 'Failed to fetch fabric' });
  }
});

// POST create new fabric
app.post('/api/fabrics', async (req, res) => {
  try {
    const fabrics = await buildFabricStructure();
    fabrics.push(req.body);
    await saveFabricStructure(fabrics);
    res.status(201).json(req.body);
  } catch (error) {
    console.error('Error creating fabric:', error);
    res.status(500).json({ error: 'Failed to create fabric' });
  }
});

// PUT update fabric by index
app.put('/api/fabrics/:index', async (req, res) => {
  try {
    const fabrics = await buildFabricStructure();
    const index = parseInt(req.params.index);
    if (index >= 0 && index < fabrics.length) {
      fabrics[index] = req.body;
      await saveFabricStructure(fabrics);
      res.json(fabrics[index]);
    } else {
      res.status(404).json({ error: 'Fabric not found' });
    }
  } catch (error) {
    console.error('Error updating fabric:', error);
    res.status(500).json({ error: 'Failed to update fabric' });
  }
});

// DELETE fabric by index
app.delete('/api/fabrics/:index', async (req, res) => {
  try {
    const fabrics = await buildFabricStructure();
    const index = parseInt(req.params.index);
    if (index >= 0 && index < fabrics.length) {
      fabrics.splice(index, 1);
      await saveFabricStructure(fabrics);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Fabric not found' });
    }
  } catch (error) {
    console.error('Error deleting fabric:', error);
    res.status(500).json({ error: 'Failed to delete fabric' });
  }
});

// PUT update all fabrics (for bulk updates)
app.put('/api/fabrics', async (req, res) => {
  try {
    await saveFabricStructure(req.body);
    res.json(req.body);
  } catch (error) {
    console.error('Error updating fabrics:', error);
    res.status(500).json({ error: 'Failed to update fabrics' });
  }
});

// Logs endpoints
app.get('/api/logs', async (req, res) => {
  try {
    const { type, fabricIndex, colorIndex, rollId, start, end, minLength, maxLength } = req.query;
    
    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
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
    
    // Convert database format to JSON format
    const formattedLogs = logs.map(log => ({
      type: log.type,
      rollId: log.roll_id,
      amount_meters: log.amount_meters ? parseFloat(log.amount_meters) : 0,
      fabricIndex: log.fabric_id ? log.fabric_id - 1 : null, // legacy index for UI
      colorIndex: log.color_id ? log.color_id - 1 : null,
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
        fabricIndex: log.fabric_id ? log.fabric_id - 1 : null,
        colorIndex: log.color_id ? log.color_id - 1 : null,
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
    
    const logData = {
      type: entry.type,
      roll_id: entry.rollId,
      fabric_id: entry.fabricId || entry.fabric_id || ((entry.fabricIndex || 0) + 1), // prefer explicit ID
      color_id: entry.colorId || entry.color_id || (entry.colorIndex !== undefined ? entry.colorIndex + 1 : null),
      fabric_name: entry.fabricName,
      color_name: entry.colorName,
      customer_id: entry.customerId || null,
      customer_name: entry.customerName,
      amount_meters: entry.amount_meters || entry.length_meters || 0,
      is_trimmable: entry.isTrimmable || false,
      weight: entry.weight || 'N/A',
      notes: entry.notes,
      timestamp: entry.timestamp || now.iso,
      epoch: entry.epoch || now.epoch,
      timezone: 'Asia/Beirut'
    };

    const [result] = await db.query(
      'INSERT INTO logs (type, roll_id, fabric_id, color_id, fabric_name, color_name, customer_id, customer_name, amount_meters, is_trimmable, weight, notes, timestamp, epoch, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logData.type, logData.roll_id, logData.fabric_id, logData.color_id, logData.fabric_name, logData.color_name, logData.customer_id, logData.customer_name, logData.amount_meters, logData.is_trimmable, logData.weight, logData.notes, logData.timestamp, logData.epoch, logData.timezone]
    );

    const response = {
      ...entry,
      id: result.insertId,
      customerId: logData.customer_id || null,
      timestamp: logData.timestamp,
      epoch: logData.epoch,
      tz: 'Asia/Beirut'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating log:', error);
    res.status(500).json({ error: 'Failed to create log' });
  }
});

app.put('/api/logs/:id', async (req, res) => {
  try {
    const updates = req.body;
    const updateData = {
      type: updates.type,
      roll_id: updates.rollId,
      fabric_id: updates.fabricId || updates.fabric_id || (updates.fabricIndex !== undefined ? updates.fabricIndex + 1 : undefined),
      color_id: updates.colorId || updates.color_id || (updates.colorIndex !== undefined ? updates.colorIndex + 1 : undefined),
      fabric_name: updates.fabricName,
      color_name: updates.colorName,
      customer_id: updates.customerId,
      customer_name: updates.customerName,
      amount_meters: updates.amount_meters,
      is_trimmable: updates.isTrimmable,
      weight: updates.weight,
      notes: updates.notes,
      timestamp: updates.timestamp,
      epoch: updates.epoch
    };

    // Build dynamic update query
    const fields = [];
    const values = [];
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (fields.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE logs SET ${fields.join(', ')} WHERE log_id = ?`, values);
    }

    const [logs] = await db.query('SELECT * FROM logs WHERE log_id = ?', [req.params.id]);
    if (logs.length > 0) {
      const log = logs[0];
      res.json({
        type: log.type,
        rollId: log.roll_id,
        amount_meters: parseFloat(log.amount_meters) || 0,
        fabricIndex: log.fabric_id - 1,
        colorIndex: log.color_id ? log.color_id - 1 : null,
        fabricName: log.fabric_name,
        colorName: log.color_name,
        customerId: log.customer_id || null,
        customerName: log.customer_name,
        notes: log.notes,
        timestamp: log.timestamp,
        epoch: log.epoch,
        id: log.log_id,
        tz: log.timezone
      });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
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
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
});

