import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

const SEED_TAG = 'TEST_SEED_RISETEXCO_2026_04';
const TEST_PASSWORD = 'Test123!';
const START_DATE = '2025-11-01';
const DAYS_TO_GENERATE = 180;
const YARDS_PER_METER = 1.0936132983;

const REQUIRED_SCHEMA = {
  users: ['user_id', 'username', 'email', 'password_hash', 'role', 'full_name'],
  fabrics: ['fabric_id', 'fabric_name', 'main_code', 'source', 'design', 'unit_type'],
  colors: [
    'color_id',
    'fabric_id',
    'color_name',
    'length_meters',
    'length_yards',
    'initial_length_meters',
    'initial_length_yards',
    'roll_count',
    'initial_roll_count',
    'date',
    'weight',
    'lot',
    'roll_nb',
    'status',
    'sold',
    'created_by_user_id',
  ],
  color_lots: [
    'lot_id',
    'color_id',
    'lot_number',
    'length_meters',
    'length_yards',
    'initial_length_meters',
    'initial_length_yards',
    'date',
    'weight',
    'roll_nb',
    'created_by_user_id',
  ],
  customers: ['customer_id', 'customer_name', 'phone', 'email', 'notes', 'created_by_user_id'],
  salespersons: ['salesperson_id', 'name', 'code', 'email', 'phone', 'active', 'created_by_user_id'],
  transaction_groups: [
    'transaction_group_id',
    'permit_number',
    'transaction_type',
    'customer_id',
    'customer_name',
    'transaction_date',
    'epoch',
    'timezone',
    'total_items',
    'total_meters',
    'total_yards',
    'notes',
  ],
  logs: [
    'log_id',
    'type',
    'fabric_id',
    'color_id',
    'customer_id',
    'salesperson_id',
    'conducted_by_user_id',
    'fabric_name',
    'color_name',
    'customer_name',
    'amount_meters',
    'amount_yards',
    'amount_kilograms',
    'roll_count',
    'weight',
    'lot',
    'roll_nb',
    'notes',
    'timestamp',
    'epoch',
    'timezone',
    'transaction_group_id',
    'reference_log_id',
  ],
};

const USER_DEFS = [
  { key: 'admin', username: 'test_admin', email: 'test_admin@risetexco.test', role: 'admin', fullName: 'Test Admin' },
  { key: 'ceo', username: 'test_ceo', email: 'test_ceo@risetexco.test', role: 'ceo', fullName: 'Test CEO' },
  { key: 'manager', username: 'test_manager', email: 'test_manager@risetexco.test', role: 'manager', fullName: 'Test Manager' },
  { key: 'accountant', username: 'test_accountant', email: 'test_accountant@risetexco.test', role: 'accountant', fullName: 'Test Accountant' },
];

const SALESPERSON_DEFS = [
  { key: 'ahmad', name: 'TEST - Ahmad Hassan', code: 'TST-AH' },
  { key: 'layla', name: 'TEST - Layla Fares', code: 'TST-LF' },
  { key: 'marie', name: 'TEST - Marie Khoury', code: 'TST-MK' },
  { key: 'ziad', name: 'TEST - Ziad Saab', code: 'TST-ZS' },
];

const CUSTOMER_DEFS = [
  { key: 'mega', name: 'TEST - Mega Fabrics Wholesale', tier: 'VIP' },
  { key: 'cedar', name: 'TEST - Cedar Boutique Beirut', tier: 'VIP' },
  { key: 'atelier', name: 'TEST - Atelier Maison Rana', tier: 'Regular' },
  { key: 'tailor', name: 'TEST - Master Tailor Karim', tier: 'Regular' },
  { key: 'factory', name: 'TEST - Zahle Garment Factory', tier: 'Wholesale' },
  { key: 'school', name: 'TEST - Fashion Institute Beirut', tier: 'Institution' },
  { key: 'jounieh', name: 'TEST - Jounieh Bridal Studio', tier: 'Regular' },
  { key: 'tripoli', name: 'TEST - Tripoli Textiles', tier: 'Regular' },
  { key: 'sidon', name: 'TEST - Sidon Sewing Center', tier: 'Occasional' },
  { key: 'designer', name: 'TEST - Designer Lina Studio', tier: 'Occasional' },
  { key: 'imports', name: 'TEST - Levant Imports', tier: 'Wholesale' },
  { key: 'sample', name: 'TEST - Walk-in Sample Customer', tier: 'Occasional' },
];

const FABRIC_DEFS = [
  {
    key: 'cotton',
    name: 'TEST Egyptian Cotton',
    mainCode: 'TST-EC',
    source: 'Egypt',
    design: 'plain',
    unitType: 'length',
    colors: [
      { key: 'navy', name: 'Navy Blue', meters: 6200, rolls: 62, weight: '180gsm' },
      { key: 'white', name: 'White', meters: 2400, rolls: 24, weight: '160gsm' },
      { key: 'red', name: 'Burgundy', meters: 1700, rolls: 17, weight: '180gsm' },
    ],
  },
  {
    key: 'linen',
    name: 'TEST Belgian Linen',
    mainCode: 'TST-BL',
    source: 'Belgium',
    design: 'woven',
    unitType: 'length',
    colors: [
      { key: 'white', name: 'Natural White', meters: 3600, rolls: 36, weight: '150gsm' },
      { key: 'sage', name: 'Sage Green', meters: 950, rolls: 10, weight: '150gsm' },
      { key: 'cream', name: 'Cream', meters: 1800, rolls: 18, weight: '150gsm' },
    ],
  },
  {
    key: 'silk',
    name: 'TEST Silk Chiffon',
    mainCode: 'TST-SC',
    source: 'China',
    design: 'chiffon',
    unitType: 'length',
    colors: [
      { key: 'rose', name: 'Rose', meters: 1700, rolls: 17, weight: '80gsm' },
      { key: 'black', name: 'Black', meters: 1200, rolls: 12, weight: '80gsm' },
      { key: 'gold', name: 'Gold', meters: 900, rolls: 9, weight: '80gsm' },
    ],
  },
  {
    key: 'denim',
    name: 'TEST Denim Heavy',
    mainCode: 'TST-DH',
    source: 'Turkey',
    design: 'twill',
    unitType: 'length',
    colors: [
      { key: 'indigo', name: 'Indigo', meters: 3900, rolls: 39, weight: '12oz' },
      { key: 'black', name: 'Black', meters: 2300, rolls: 23, weight: '12oz' },
    ],
  },
  {
    key: 'wool',
    name: 'TEST Merino Wool',
    mainCode: 'TST-MW',
    source: 'Italy',
    design: 'suiting',
    unitType: 'length',
    colors: [
      { key: 'charcoal', name: 'Charcoal', meters: 1500, rolls: 15, weight: '240gsm' },
      { key: 'camel', name: 'Camel', meters: 1300, rolls: 13, weight: '240gsm' },
    ],
  },
  {
    key: 'satin',
    name: 'TEST Satin Deluxe',
    mainCode: 'TST-SD',
    source: 'Italy',
    design: 'satin',
    unitType: 'length',
    colors: [
      { key: 'emerald', name: 'Emerald', meters: 1300, rolls: 13, weight: '110gsm' },
      { key: 'ivory', name: 'Ivory', meters: 1100, rolls: 11, weight: '110gsm' },
    ],
  },
  {
    key: 'yarn',
    name: 'TEST Wool Yarn Bulk',
    mainCode: 'TST-WY',
    source: 'Lebanon',
    design: 'bulk',
    unitType: 'weight',
    colors: [
      { key: 'ivory', name: 'Ivory', kilograms: 1200, rolls: 30 },
      { key: 'black', name: 'Black', kilograms: 850, rolls: 22 },
    ],
  },
];

function parseArgs(argv) {
  const args = {
    envFile: '.env',
    dryRun: false,
    checkSchema: false,
    allowRemote: false,
    append: false,
    summaryFile: 'data/test-seed-summary.json',
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--check-schema') args.checkSchema = true;
    else if (arg === '--allow-remote') args.allowRemote = true;
    else if (arg === '--append') args.append = true;
    else if (arg === '--no-summary-file') args.summaryFile = null;
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (arg.startsWith('--summary-file=')) args.summaryFile = arg.slice('--summary-file='.length);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run seed:test -- [options]

Options:
  --env-file=.env.test       Load a different env file
  --check-schema             Validate tables/columns only; no data changes
  --dry-run                  Insert inside a transaction and roll it back
  --append                   Do not delete previous TEST seed records first
  --allow-remote             Permit seeding a non-local DB host
  --summary-file=path.json   Write accuracy summary JSON after seeding
  --no-summary-file          Print summary only
`);
}

function round2(value) {
  return Number.parseFloat(Number(value || 0).toFixed(2));
}

function metersToYards(meters) {
  return round2(meters * YARDS_PER_METER);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mysqlDateTime(dateString, hour, minute) {
  return `${dateString} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function epochMs(dateString, hour, minute) {
  return Date.parse(`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
}

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choice(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function randomBetween(min, max, rng) {
  return round2(min + (max - min) * rng());
}

function tableRows(rows, columns) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
}

function getDbConfig() {
  const uri =
    process.env.MYSQL_PRIVATE_URL ||
    process.env.MYSQL_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.DATABASE_URL;

  if (uri) {
    return {
      uri,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

function getTargetInfo() {
  const uri =
    process.env.MYSQL_PRIVATE_URL ||
    process.env.MYSQL_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.DATABASE_URL;

  if (!uri) {
    return {
      host: process.env.DB_HOST || '',
      database: process.env.DB_NAME || '',
    };
  }

  try {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return { host: 'connection-string', database: process.env.DB_NAME || '' };
  }
}

function assertSafeTarget(args) {
  const { host, database } = getTargetInfo();
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  const normalizedHost = String(host || '').toLowerCase();
  const normalizedDb = String(database || '').toLowerCase();

  if (nodeEnv === 'production') {
    throw new Error('Refusing to seed while NODE_ENV=production.');
  }

  if (normalizedDb.includes('prod') || normalizedDb.includes('production')) {
    throw new Error(`Refusing to seed database "${database}" because it looks like production.`);
  }

  if (!args.allowRemote && normalizedHost && !localHosts.has(normalizedHost)) {
    throw new Error(`Refusing to seed non-local DB host "${host}". Use --allow-remote only for a disposable test database.`);
  }
}

async function validateSchema(conn) {
  const [tables] = await conn.query('SHOW TABLES');
  const tableNames = new Set(tables.map((row) => Object.values(row)[0]));
  const missingTables = [];
  const missingColumns = [];

  for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
    if (!tableNames.has(table)) {
      missingTables.push(table);
      continue;
    }

    const [columns] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const columnNames = new Set(columns.map((column) => column.Field));
    for (const column of requiredColumns) {
      if (!columnNames.has(column)) {
        missingColumns.push(`${table}.${column}`);
      }
    }
  }

  if (missingTables.length || missingColumns.length) {
    const details = [
      missingTables.length ? `Missing tables: ${missingTables.join(', ')}` : null,
      missingColumns.length ? `Missing columns: ${missingColumns.join(', ')}` : null,
    ].filter(Boolean);
    throw new Error(details.join('\n'));
  }
}

async function pluck(conn, sql, params = [], key = 'id') {
  const [rows] = await conn.query(sql, params);
  return rows.map((row) => row[key]).filter((value) => value !== null && value !== undefined);
}

async function deleteByIds(conn, table, column, ids) {
  if (!ids.length) return 0;
  const [result] = await conn.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (?)`, [ids]);
  return result.affectedRows || 0;
}

async function resetSeedData(conn) {
  const seedFabricIds = await pluck(
    conn,
    'SELECT fabric_id AS id FROM fabrics WHERE main_code LIKE ? OR fabric_name LIKE ?',
    ['TST-%', 'TEST %']
  );
  const seedColorIds = seedFabricIds.length
    ? await pluck(conn, 'SELECT color_id AS id FROM colors WHERE fabric_id IN (?)', [seedFabricIds])
    : [];
  const seedUserIds = await pluck(
    conn,
    'SELECT user_id AS id FROM users WHERE username LIKE ? OR email LIKE ?',
    ['test\\_%', '%@risetexco.test']
  );
  const groupIdsFromLogs =
    seedFabricIds.length || seedColorIds.length
      ? await pluck(
          conn,
          `SELECT DISTINCT transaction_group_id AS id
           FROM logs
           WHERE transaction_group_id IS NOT NULL
             AND (${seedFabricIds.length ? 'fabric_id IN (?)' : 'FALSE'}
              OR ${seedColorIds.length ? 'color_id IN (?)' : 'FALSE'}
              OR notes LIKE ?)`,
          [
            ...(seedFabricIds.length ? [seedFabricIds] : []),
            ...(seedColorIds.length ? [seedColorIds] : []),
            `%${SEED_TAG}%`,
          ]
        )
      : [];
  const explicitGroupIds = await pluck(
    conn,
    'SELECT transaction_group_id AS id FROM transaction_groups WHERE transaction_group_id LIKE ? OR notes LIKE ?',
    ['TST-%', `%${SEED_TAG}%`]
  );
  const seedGroupIds = [...new Set([...groupIdsFromLogs, ...explicitGroupIds])];

  const counts = {};
  counts.cancellation_requests = await deleteByIds(conn, 'cancellation_requests', 'transaction_group_id', seedGroupIds);
  counts.logs = await deleteByIds(conn, 'logs', 'transaction_group_id', seedGroupIds);

  if (seedFabricIds.length) {
    const [logDelete] = await conn.query('DELETE FROM logs WHERE fabric_id IN (?) OR notes LIKE ?', [
      seedFabricIds,
      `%${SEED_TAG}%`,
    ]);
    counts.logs += logDelete.affectedRows || 0;
  } else {
    const [logDelete] = await conn.query('DELETE FROM logs WHERE notes LIKE ?', [`%${SEED_TAG}%`]);
    counts.logs += logDelete.affectedRows || 0;
  }

  counts.transaction_groups = await deleteByIds(conn, 'transaction_groups', 'transaction_group_id', seedGroupIds);

  if (seedColorIds.length) {
    const [deletionRequestsForColors] = await conn.query(
      "DELETE FROM deletion_requests WHERE request_type = 'delete_color' AND target_id IN (?)",
      [seedColorIds]
    );
    counts.deletion_requests = deletionRequestsForColors.affectedRows || 0;
  }

  if (seedFabricIds.length) {
    const [deletionRequestsForFabrics] = await conn.query(
      "DELETE FROM deletion_requests WHERE request_type = 'delete_fabric' AND target_id IN (?)",
      [seedFabricIds]
    );
    counts.deletion_requests = (counts.deletion_requests || 0) + (deletionRequestsForFabrics.affectedRows || 0);
  }

  counts.color_lots = await deleteByIds(conn, 'color_lots', 'color_id', seedColorIds);
  counts.colors = await deleteByIds(conn, 'colors', 'color_id', seedColorIds);
  counts.fabrics = await deleteByIds(conn, 'fabrics', 'fabric_id', seedFabricIds);

  const [customerDelete] = await conn.query('DELETE FROM customers WHERE customer_name LIKE ? OR notes LIKE ?', [
    'TEST - %',
    `%${SEED_TAG}%`,
  ]);
  counts.customers = customerDelete.affectedRows || 0;

  const [salespersonDelete] = await conn.query('DELETE FROM salespersons WHERE code LIKE ? OR name LIKE ?', [
    'TST-%',
    'TEST - %',
  ]);
  counts.salespersons = salespersonDelete.affectedRows || 0;

  counts.audit_logs = await deleteByIds(conn, 'audit_logs', 'user_id', seedUserIds);
  counts.users = await deleteByIds(conn, 'users', 'user_id', seedUserIds);

  return counts;
}

async function seedUsers(conn) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const users = new Map();

  for (const user of USER_DEFS) {
    const [result] = await conn.query(
      `INSERT INTO users (username, email, password_hash, role, full_name)
       VALUES (?, ?, ?, ?, ?)`,
      [user.username, user.email, passwordHash, user.role, user.fullName]
    );
    users.set(user.key, { ...user, id: result.insertId });
  }

  return users;
}

async function seedCustomers(conn, adminId) {
  const customers = new Map();

  for (const customer of CUSTOMER_DEFS) {
    const emailLocal = customer.name
      .replace(/^TEST - /, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/(^\.|\.$)/g, '');

    const [result] = await conn.query(
      `INSERT INTO customers (customer_name, phone, email, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        customer.name,
        `+961 70 ${String(100000 + resultSafeNumber(customer.key)).slice(0, 6)}`,
        `${emailLocal}@example.test`,
        `${SEED_TAG}; tier=${customer.tier}`,
        adminId,
      ]
    );
    customers.set(customer.key, { ...customer, id: result.insertId });
  }

  return customers;
}

function resultSafeNumber(value) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 137;
}

async function seedSalespersons(conn, adminId) {
  const salespersons = new Map();

  for (const salesperson of SALESPERSON_DEFS) {
    const [result] = await conn.query(
      `INSERT INTO salespersons (name, code, email, phone, active, created_by_user_id)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [
        salesperson.name,
        salesperson.code,
        `${salesperson.code.toLowerCase()}@risetexco.test`,
        `+961 71 ${String(200000 + resultSafeNumber(salesperson.key)).slice(0, 6)}`,
        adminId,
      ]
    );
    salespersons.set(salesperson.key, { ...salesperson, id: result.insertId });
  }

  return salespersons;
}

async function seedFabricsAndColors(conn, adminId) {
  const fabrics = new Map();
  const colors = new Map();

  for (const fabric of FABRIC_DEFS) {
    const [fabricResult] = await conn.query(
      `INSERT INTO fabrics (fabric_name, main_code, source, design, unit_type, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fabric.name, fabric.mainCode, fabric.source, fabric.design, fabric.unitType, adminId]
    );

    const fabricRecord = { ...fabric, id: fabricResult.insertId };
    fabrics.set(fabric.key, fabricRecord);

    for (let index = 0; index < fabric.colors.length; index += 1) {
      const color = fabric.colors[index];
      const date = addDays(START_DATE, -14 + index);
      const lot = `TST-${fabric.mainCode.replace('TST-', '')}-${String(index + 1).padStart(2, '0')}`;
      const rollNb = `TST-ROLL-${String(index + 1).padStart(3, '0')}`;
      const initialMeters = fabric.unitType === 'length' ? round2(color.meters) : 0;
      const initialYards = metersToYards(initialMeters);
      const initialKg = fabric.unitType === 'weight' ? round2(color.kilograms) : null;
      const weight = fabric.unitType === 'weight' ? `${initialKg.toFixed(2)} kg` : color.weight;

      const [colorResult] = await conn.query(
        `INSERT INTO colors
         (fabric_id, color_name, length_meters, length_yards, initial_length_meters, initial_length_yards,
          roll_count, initial_roll_count, date, weight, lot, roll_nb, status, sold, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', 0, ?)`,
        [
          fabricRecord.id,
          color.name,
          initialMeters,
          initialYards,
          initialMeters,
          initialYards,
          color.rolls,
          color.rolls,
          date,
          weight,
          lot,
          rollNb,
          adminId,
        ]
      );

      const colorRecord = {
        ...color,
        id: colorResult.insertId,
        fabricId: fabricRecord.id,
        fabricKey: fabric.key,
        fabricName: fabric.name,
        colorName: color.name,
        unitType: fabric.unitType,
        lot,
        rollNb,
        currentMeters: initialMeters,
        currentYards: initialYards,
        currentKg: initialKg,
        currentRolls: color.rolls,
        weight,
      };

      colors.set(`${fabric.key}:${color.key}`, colorRecord);

      if (fabric.unitType === 'length') {
        await insertLots(conn, colorRecord, date, adminId);
      }
    }
  }

  return { fabrics, colors };
}

async function insertLots(conn, color, baseDate, adminId) {
  const firstLotMeters = round2(color.currentMeters * 0.55);
  const secondLotMeters = round2(color.currentMeters - firstLotMeters);
  const lots = [
    { suffix: 'A', meters: firstLotMeters, dayOffset: 0 },
    { suffix: 'B', meters: secondLotMeters, dayOffset: 7 },
  ];

  for (const lot of lots) {
    await conn.query(
      `INSERT INTO color_lots
       (color_id, lot_number, length_meters, length_yards, initial_length_meters, initial_length_yards,
        date, weight, roll_nb, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        color.id,
        `${color.lot}-${lot.suffix}`,
        lot.meters,
        metersToYards(lot.meters),
        lot.meters,
        metersToYards(lot.meters),
        addDays(baseDate, lot.dayOffset),
        color.weight,
        `${color.rollNb}-${lot.suffix}`,
        adminId,
      ]
    );
  }
}

async function updateColorStock(conn, color, item, direction) {
  const rollDelta = Number.parseInt(item.rollCount || 0, 10);

  if (color.unitType === 'weight') {
    const kg = round2(item.kilograms || 0);
    const nextKg = round2(color.currentKg + direction * kg);
    if (nextKg < -0.001) {
      throw new Error(`Insufficient weight stock for ${color.fabricName} / ${color.colorName}`);
    }
    color.currentKg = nextKg;
    color.currentRolls = Math.max(0, color.currentRolls + direction * rollDelta);
    color.weight = `${nextKg.toFixed(2)} kg`;

    await conn.query('UPDATE colors SET weight = ?, roll_count = ?, sold = ? WHERE color_id = ?', [
      color.weight,
      color.currentRolls,
      nextKg <= 0.001 ? 1 : 0,
      color.id,
    ]);
    return;
  }

  const meters = round2(item.meters || 0);
  const yards = metersToYards(meters);
  const nextMeters = round2(color.currentMeters + direction * meters);
  const nextYards = round2(color.currentYards + direction * yards);

  if (nextMeters < -0.001 || nextYards < -0.001) {
    throw new Error(`Insufficient length stock for ${color.fabricName} / ${color.colorName}`);
  }

  color.currentMeters = nextMeters;
  color.currentYards = nextYards;
  color.currentRolls = Math.max(0, color.currentRolls + direction * rollDelta);

  await conn.query(
    'UPDATE colors SET length_meters = ?, length_yards = ?, roll_count = ?, sold = ? WHERE color_id = ?',
    [nextMeters, nextYards, color.currentRolls, nextMeters <= 0.001 ? 1 : 0, color.id]
  );
}

async function insertTransactionGroup(conn, context, data) {
  const sequence = String(context.nextGroupNumber++).padStart(5, '0');
  const typeKey = data.transactionType === 'return' ? 'return' : data.transactionType;
  const permitSequence = String(context.nextPermitNumbers[typeKey]++).padStart(5, '0');
  const transactionGroupId = `TST-G-${sequence}`;
  const permitNumber = `${data.transactionType.toUpperCase().slice(0, 1)}-TEST-${permitSequence}`;
  const totalMeters = round2(data.items.reduce((sum, item) => sum + (item.meters || 0), 0));
  const totalYards = metersToYards(totalMeters);

  await conn.query(
    `INSERT INTO transaction_groups
     (transaction_group_id, permit_number, transaction_type, customer_id, customer_name, transaction_date,
      epoch, timezone, total_items, total_meters, total_yards, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Asia/Beirut', ?, ?, ?, ?)`,
    [
      transactionGroupId,
      permitNumber,
      data.transactionType,
      data.customer.id,
      data.customer.name,
      data.dateTime,
      data.epoch,
      data.items.length,
      totalMeters,
      totalYards,
      `${SEED_TAG}; ${data.notes}`,
    ]
  );

  return { transactionGroupId, permitNumber, totalMeters, totalYards };
}

async function insertLog(conn, context, data) {
  const [result] = await conn.query(
    `INSERT INTO logs
     (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id,
      fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms,
      roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone,
      transaction_group_id, reference_log_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Asia/Beirut', ?, ?)`,
    [
      data.type,
      data.color.fabricId,
      data.color.id,
      data.customer.id,
      data.salesperson.id,
      context.users.get('manager').id,
      data.color.fabricName,
      data.color.colorName,
      data.customer.name,
      data.amountMeters,
      data.amountYards,
      data.amountKilograms,
      data.rollCount,
      data.color.weight || 'N/A',
      data.color.lot,
      data.color.rollNb,
      `${SEED_TAG}; ${data.notes}`,
      data.dateTime,
      data.epoch,
      data.transactionGroupId,
      data.referenceLogId || null,
    ]
  );

  return result.insertId;
}

async function createSaleGroup(conn, context, plan) {
  const transactionGroup = await insertTransactionGroup(conn, context, {
    transactionType: plan.transactionType,
    customer: plan.customer,
    dateTime: plan.dateTime,
    epoch: plan.epoch,
    items: plan.items,
    notes: plan.notes,
  });
  const createdLogs = [];

  for (const item of plan.items) {
    const color = context.colors.get(item.colorKey);
    const amountMeters = color.unitType === 'weight' ? 0 : round2(item.meters);
    const amountYards = color.unitType === 'weight' ? 0 : metersToYards(item.meters);
    const amountKilograms = color.unitType === 'weight' ? round2(item.kilograms) : null;
    const rollCount = Number.parseInt(item.rollCount || 0, 10);

    const logId = await insertLog(conn, context, {
      type: 'sell',
      color,
      customer: plan.customer,
      salesperson: plan.salesperson,
      amountMeters,
      amountYards,
      amountKilograms,
      rollCount,
      notes: plan.notes,
      dateTime: plan.dateTime,
      epoch: plan.epoch,
      transactionGroupId: transactionGroup.transactionGroupId,
    });

    await updateColorStock(conn, color, { meters: amountMeters, kilograms: amountKilograms, rollCount }, -1);

    const logRecord = {
      logId,
      colorKey: item.colorKey,
      customer: plan.customer,
      salesperson: plan.salesperson,
      amountMeters,
      amountYards,
      amountKilograms,
      rollCount,
      dateTime: plan.dateTime,
      epoch: plan.epoch,
      returned: false,
    };
    context.sellLogs.push(logRecord);
    createdLogs.push(logRecord);
  }

  return createdLogs;
}

async function createReturnGroup(conn, context, sourceLog, dateString, rng) {
  const color = context.colors.get(sourceLog.colorKey);
  const amountMeters = sourceLog.amountMeters > 0 ? round2(Math.min(sourceLog.amountMeters * 0.22, 18)) : 0;
  const amountKilograms =
    sourceLog.amountKilograms && sourceLog.amountKilograms > 0 ? round2(Math.min(sourceLog.amountKilograms * 0.18, 8)) : null;

  if (!amountMeters && !amountKilograms) return null;

  const customer = sourceLog.customer;
  const salesperson = sourceLog.salesperson;
  const hour = 15 + Math.floor(rng() * 3);
  const minute = Math.floor(rng() * 50);
  const dateTime = mysqlDateTime(dateString, hour, minute);
  const timestamp = epochMs(dateString, hour, minute);
  const items = [{ colorKey: sourceLog.colorKey, meters: amountMeters, kilograms: amountKilograms, rollCount: 1 }];
  const transactionGroup = await insertTransactionGroup(conn, context, {
    transactionType: 'return',
    customer,
    dateTime,
    epoch: timestamp,
    items,
    notes: `partial return for seeded sell log ${sourceLog.logId}`,
  });

  const logId = await insertLog(conn, context, {
    type: 'return',
    color,
    customer,
    salesperson,
    amountMeters,
    amountYards: metersToYards(amountMeters),
    amountKilograms,
    rollCount: 1,
    notes: `partial return for seeded sell log ${sourceLog.logId}`,
    dateTime,
    epoch: timestamp,
    transactionGroupId: transactionGroup.transactionGroupId,
    referenceLogId: sourceLog.logId,
  });

  await updateColorStock(conn, color, { meters: amountMeters, kilograms: amountKilograms, rollCount: 1 }, 1);
  sourceLog.returned = true;
  return logId;
}

function buildDailyPlan(context, day, rng) {
  const date = addDays(START_DATE, day);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return null;

  const customers = context.customers;
  const salespersons = context.salespersons;
  const customerPool = [
    customers.get('mega'),
    customers.get('mega'),
    customers.get('cedar'),
    customers.get('factory'),
    customers.get('atelier'),
    customers.get('tailor'),
    customers.get('jounieh'),
    customers.get('tripoli'),
    customers.get('imports'),
    customers.get('sample'),
  ];
  const salespersonPool = [
    salespersons.get('ahmad'),
    salespersons.get('ahmad'),
    salespersons.get('layla'),
    salespersons.get('marie'),
    salespersons.get('ziad'),
  ];
  const items = [];

  if (day % 2 === 0) {
    items.push({ colorKey: 'cotton:navy', meters: randomBetween(28, 58, rng), rollCount: 1 + Math.floor(rng() * 2) });
  }
  if (day % 3 === 0) {
    items.push({ colorKey: 'linen:white', meters: randomBetween(18, 42, rng), rollCount: 1 });
  }
  if (day % 4 === 0) {
    items.push({ colorKey: 'denim:indigo', meters: randomBetween(16, 40, rng), rollCount: 1 });
  }
  if (day % 5 === 0) {
    items.push({ colorKey: 'silk:rose', meters: randomBetween(8, 28, rng), rollCount: 1 });
  }
  if (day % 7 === 0) {
    items.push({ colorKey: 'wool:charcoal', meters: randomBetween(12, 32, rng), rollCount: 1 });
  }
  if (day % 9 === 0) {
    items.push({ colorKey: 'satin:emerald', meters: randomBetween(10, 26, rng), rollCount: 1 });
  }
  if (day % 6 === 0) {
    items.push({ colorKey: 'yarn:ivory', kilograms: randomBetween(18, 44, rng), rollCount: 1 });
  }
  if (day % 11 === 0) {
    items.push({ colorKey: 'cotton:white', meters: randomBetween(14, 35, rng), rollCount: 1 });
  }

  if (!items.length) return null;

  const hour = 9 + Math.floor(rng() * 8);
  const minute = Math.floor(rng() * 55);

  return {
    transactionType: day % 10 === 0 ? 'B' : 'A',
    customer: choice(customerPool, rng),
    salesperson: choice(salespersonPool, rng),
    dateTime: mysqlDateTime(date, hour, minute),
    epoch: epochMs(date, hour, minute),
    items: items.slice(0, 4),
    notes: 'regular seeded sales pattern',
  };
}

async function createLowStockCase(conn, context) {
  const color = context.colors.get('linen:sage');
  const leaveMeters = 8;
  const amountMeters = round2(color.currentMeters - leaveMeters);
  if (amountMeters <= 0) return;

  const date = addDays(START_DATE, DAYS_TO_GENERATE - 2);
  await createSaleGroup(conn, context, {
    transactionType: 'A',
    customer: context.customers.get('mega'),
    salesperson: context.salespersons.get('ahmad'),
    dateTime: mysqlDateTime(date, 14, 25),
    epoch: epochMs(date, 14, 25),
    items: [{ colorKey: 'linen:sage', meters: amountMeters, rollCount: Math.max(1, color.currentRolls - 1) }],
    notes: 'intentional low-stock accuracy case; Sage Green should finish near 8 meters',
  });
}

async function seedTransactions(conn, context) {
  const rng = makeRng(20260429);

  for (let day = 0; day < DAYS_TO_GENERATE; day += 1) {
    const plan = buildDailyPlan(context, day, rng);
    if (plan) {
      await createSaleGroup(conn, context, plan);
    }

    if (day > 21 && day % 23 === 0) {
      const date = addDays(START_DATE, day);
      const returnable = context.sellLogs.filter((log) => !log.returned && (log.amountMeters > 14 || log.amountKilograms > 10));
      if (returnable.length) {
        await createReturnGroup(conn, context, choice(returnable, rng), date, rng);
      }
    }
  }

  await createLowStockCase(conn, context);
}

async function collectSummary(conn) {
  const [[counts]] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE username LIKE 'test\\_%') AS users,
      (SELECT COUNT(*) FROM fabrics WHERE main_code LIKE 'TST-%') AS fabrics,
      (SELECT COUNT(*) FROM colors c JOIN fabrics f ON c.fabric_id = f.fabric_id WHERE f.main_code LIKE 'TST-%') AS colors,
      (SELECT COUNT(*) FROM customers WHERE customer_name LIKE 'TEST - %') AS customers,
      (SELECT COUNT(*) FROM salespersons WHERE code LIKE 'TST-%') AS salespersons,
      (SELECT COUNT(*) FROM transaction_groups WHERE transaction_group_id LIKE 'TST-%') AS transaction_groups,
      (SELECT COUNT(*) FROM logs WHERE notes LIKE ?) AS logs
  `, [`%${SEED_TAG}%`]);

  const [topFabrics] = await conn.query(`
    SELECT
      f.fabric_name,
      f.unit_type,
      ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS sold_meters,
      ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_kilograms, 0) ELSE 0 END), 2) AS sold_kilograms,
      COUNT(CASE WHEN l.type = 'sell' THEN 1 END) AS sell_log_count
    FROM logs l
    JOIN fabrics f ON f.fabric_id = l.fabric_id
    WHERE l.notes LIKE ?
    GROUP BY f.fabric_id, f.fabric_name, f.unit_type
    ORDER BY sold_meters DESC, sold_kilograms DESC
    LIMIT 8
  `, [`%${SEED_TAG}%`]);

  const [topCustomers] = await conn.query(`
    SELECT
      customer_name,
      ROUND(SUM(CASE WHEN type = 'sell' THEN COALESCE(amount_meters, 0) ELSE 0 END), 2) AS sold_meters,
      ROUND(SUM(CASE WHEN type = 'sell' THEN COALESCE(amount_kilograms, 0) ELSE 0 END), 2) AS sold_kilograms,
      COUNT(CASE WHEN type = 'sell' THEN 1 END) AS sell_log_count
    FROM logs
    WHERE notes LIKE ?
    GROUP BY customer_name
    ORDER BY sold_meters DESC, sold_kilograms DESC
    LIMIT 8
  `, [`%${SEED_TAG}%`]);

  const [topSalespersons] = await conn.query(`
    SELECT
      s.name,
      ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS sold_meters,
      ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_kilograms, 0) ELSE 0 END), 2) AS sold_kilograms,
      COUNT(CASE WHEN l.type = 'sell' THEN 1 END) AS sell_log_count
    FROM logs l
    JOIN salespersons s ON s.salesperson_id = l.salesperson_id
    WHERE l.notes LIKE ?
    GROUP BY s.salesperson_id, s.name
    ORDER BY sold_meters DESC, sold_kilograms DESC
    LIMIT 8
  `, [`%${SEED_TAG}%`]);

  const [lowStock] = await conn.query(`
    SELECT
      f.fabric_name,
      c.color_name,
      ROUND(c.length_meters, 2) AS length_meters,
      ROUND(c.length_yards, 2) AS length_yards,
      c.roll_count,
      c.weight
    FROM colors c
    JOIN fabrics f ON f.fabric_id = c.fabric_id
    WHERE f.main_code LIKE 'TST-%'
    ORDER BY c.length_meters ASC, c.color_id ASC
    LIMIT 8
  `);

  const [monthlySales] = await conn.query(`
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(epoch / 1000), '%Y-%m') AS month,
      type,
      COUNT(*) AS log_count,
      ROUND(SUM(COALESCE(amount_meters, 0)), 2) AS meters,
      ROUND(SUM(COALESCE(amount_kilograms, 0)), 2) AS kilograms
    FROM logs
    WHERE notes LIKE ?
    GROUP BY month, type
    ORDER BY month, type
  `, [`%${SEED_TAG}%`]);

  return {
    seedTag: SEED_TAG,
    period: {
      startDate: START_DATE,
      daysGenerated: DAYS_TO_GENERATE,
    },
    login: {
      password: TEST_PASSWORD,
      usernames: USER_DEFS.map((user) => ({ username: user.username, role: user.role })),
    },
    counts,
    expectedAccuracyChecks: {
      topFabricByMeters: topFabrics[0] || null,
      topCustomerByMeters: topCustomers[0] || null,
      topSalespersonByMeters: topSalespersons[0] || null,
      lowestStockLengthColor: lowStock.find((row) => Number(row.length_meters) > 0) || null,
    },
    topFabrics,
    topCustomers,
    topSalespersons,
    lowStock,
    monthlySales,
  };
}

async function writeSummary(summary, summaryFile) {
  if (!summaryFile) return;
  const absolutePath = path.resolve(summaryFile);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Summary written to ${summaryFile}`);
}

function printSummary(summary) {
  console.log('\nSeed summary');
  console.table([summary.counts]);

  console.log('\nAccuracy checks to compare against the app/API/AI answers');
  console.table(tableRows([summary.expectedAccuracyChecks.topFabricByMeters].filter(Boolean), ['fabric_name', 'unit_type', 'sold_meters', 'sold_kilograms']));
  console.table(tableRows([summary.expectedAccuracyChecks.topCustomerByMeters].filter(Boolean), ['customer_name', 'sold_meters', 'sold_kilograms']));
  console.table(tableRows([summary.expectedAccuracyChecks.topSalespersonByMeters].filter(Boolean), ['name', 'sold_meters', 'sold_kilograms']));
  console.table(tableRows([summary.expectedAccuracyChecks.lowestStockLengthColor].filter(Boolean), ['fabric_name', 'color_name', 'length_meters', 'length_yards']));

  console.log('\nTest logins');
  for (const user of summary.login.usernames) {
    console.log(`  ${user.username} / ${summary.login.password} (${user.role})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  dotenv.config({ path: args.envFile });
  assertSafeTarget(args);

  const target = getTargetInfo();
  console.log(`Using env file: ${args.envFile}`);
  console.log(`Target database: ${target.database || '(from connection string)'} on ${target.host || '(unknown host)'}`);

  let conn;
  let transactionStarted = false;

  try {
    conn = await mysql.createConnection(getDbConfig());
    await validateSchema(conn);
    console.log('Schema check passed.');

    if (args.checkSchema) {
      return;
    }

    await conn.beginTransaction();
    transactionStarted = true;

    if (!args.append) {
      const resetCounts = await resetSeedData(conn);
      console.log('Previous test seed records removed:');
      console.table([resetCounts]);
    }

    const users = await seedUsers(conn);
    const customers = await seedCustomers(conn, users.get('admin').id);
    const salespersons = await seedSalespersons(conn, users.get('admin').id);
    const { fabrics, colors } = await seedFabricsAndColors(conn, users.get('admin').id);

    const context = {
      users,
      customers,
      salespersons,
      fabrics,
      colors,
      nextGroupNumber: 1,
      nextPermitNumbers: { A: 1, B: 1, return: 1 },
      sellLogs: [],
    };

    await seedTransactions(conn, context);
    const summary = await collectSummary(conn);
    printSummary(summary);

    if (args.dryRun) {
      await conn.rollback();
      transactionStarted = false;
      console.log('\nDry run complete. All inserted seed data was rolled back.');
      return;
    }

    await conn.commit();
    transactionStarted = false;
    await writeSummary(summary, args.summaryFile);
    console.log('\nSeed complete.');
  } catch (error) {
    if (conn && transactionStarted) {
      await conn.rollback();
    }
    console.error('\nSeed failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

main();
