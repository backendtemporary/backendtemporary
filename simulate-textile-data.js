/**
 * ==================================================================
 * RISETEXCO DATA SIMULATION SCRIPT
 * ==================================================================
 * 
 * PURPOSE: Generate 6 months of realistic textile transaction data
 * for testing n8n AI Agent pattern recognition.
 * 
 * Features:
 * - Realistic fabric types (cotton, silk, linen, polyester)
 * - Seasonal variations (summer fabrics peak in May-August)
 * - Customer behavior patterns (VIPs, occasional buyers)
 * - Procurement orders with supplier attribution
 * - Price history with margin tracking
 * 
 * USAGE:
 *   npm install --save-dev
 *   node backend/simulate-textile-data.js
 * 
 * WARNING: This will INSERT data into your DB. Use on DEV only!
 * ==================================================================
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  MONTHS_TO_SIMULATE: 6,
  START_DATE: new Date(2025, 8, 1), // September 1, 2025
  FABRICS_COUNT: 20,
  COLORS_PER_FABRIC: 5,
  CUSTOMERS_COUNT: 50,
  SALESPERSONS_COUNT: 5,
  SUPPLIERS_COUNT: 4,
  TRANSACTIONS_PER_DAY_AVG: 8, // Average transactions per day
};

// ============================================
// DATA TEMPLATES
// ============================================

const FABRIC_TEMPLATES = [
  // Cotton fabrics (popular in summer)
  { name: 'Egyptian Cotton', code: 'EC', type: 'cotton', season: 'summer', cost: 12, price: 18 },
  { name: 'Turkish Cotton', code: 'TC', type: 'cotton', season: 'summer', cost: 10, price: 15 },
  { name: 'Organic Cotton', code: 'OC', type: 'cotton', season: 'all', cost: 14, price: 21 },
  { name: 'Cotton Blend', code: 'CB', type: 'cotton', season: 'all', cost: 8, price: 12 },
  
  // Silk fabrics (luxury, year-round)
  { name: 'Pure Silk', code: 'PS', type: 'silk', season: 'all', cost: 35, price: 55 },
  { name: 'Silk Blend', code: 'SB', type: 'silk', season: 'all', cost: 25, price: 40 },
  { name: 'Silk Chiffon', code: 'SC', type: 'silk', season: 'spring', cost: 30, price: 48 },
  
  // Linen (summer peak)
  { name: 'Belgian Linen', code: 'BL', type: 'linen', season: 'summer', cost: 16, price: 25 },
  { name: 'Linen Blend', code: 'LB', type: 'linen', season: 'summer', cost: 12, price: 19 },
  { name: 'Irish Linen', code: 'IL', type: 'linen', season: 'summer', cost: 18, price: 28 },
  
  // Polyester (year-round, budget)
  { name: 'Polyester Plain', code: 'PP', type: 'polyester', season: 'all', cost: 5, price: 9 },
  { name: 'Polyester Satin', code: 'PST', type: 'polyester', season: 'all', cost: 7, price: 12 },
  
  // Wool (winter peak)
  { name: 'Merino Wool', code: 'MW', type: 'wool', season: 'winter', cost: 22, price: 35 },
  { name: 'Wool Blend', code: 'WB', type: 'wool', season: 'winter', cost: 15, price: 24 },
  
  // Specialty fabrics
  { name: 'Velvet Crush', code: 'VC', type: 'specialty', season: 'winter', cost: 20, price: 32 },
  { name: 'Satin Deluxe', code: 'SD', type: 'specialty', season: 'all', cost: 18, price: 28 },
  { name: 'Jacquard', code: 'JQ', type: 'specialty', season: 'fall', cost: 24, price: 38 },
  { name: 'Brocade', code: 'BR', type: 'specialty', season: 'winter', cost: 28, price: 45 },
  { name: 'Denim Heavy', code: 'DH', type: 'denim', season: 'all', cost: 11, price: 17 },
  { name: 'Chambray Light', code: 'CL', type: 'denim', season: 'summer', cost: 9, price: 14 },
];

const COLOR_NAMES = [
  'White', 'Black', 'Navy Blue', 'Royal Blue', 'Sky Blue',
  'Red', 'Burgundy', 'Pink', 'Rose',
  'Green', 'Olive', 'Mint',
  'Yellow', 'Gold', 'Beige', 'Cream',
  'Gray', 'Charcoal', 'Silver',
  'Purple', 'Lavender', 'Violet',
  'Orange', 'Coral', 'Peach',
  'Brown', 'Tan', 'Khaki',
];

const CUSTOMER_NAMES = [
  // Lebanese clothing stores
  'Boutique Chic Beirut', 'Elegance Fashion House', 'Style Corner Tripoli',
  'Modernity Boutique', 'Elite Fabrics Store', 'Royal Textiles Sidon',
  'Fashion Forward', 'Luxury Garments Co.', 'Trendsetter Boutique',
  // Tailors
  'Master Tailor Ahmad', 'Bespoke by Rami', 'Couture Atelier Marie',
  'Sewing Studio Ziad', 'Custom Fits by Nadia', 'Tailor Pro Joseph',
  // Manufacturers
  'Zahle Garment Factory', 'Textile Manufacturing Co.', 'Lebanon Apparel Ltd.',
  'Stitch & Sew Industries', 'Beirut Textile Works',
  // Wholesalers
  'Mega Fabrics Wholesale', 'Bulk Textiles Lebanon', 'Import Export Hassan',
  'Wholesale King Fabrics', 'Trading House Khalil',
  // Individual designers
  'Designer Layla Creations', 'Artisan Fabrics by Yara', 'Handmade by Sami',
  'Fashion Studio Tony', 'Creative Textiles Lina',
  // Schools/institutions
  'Fashion Institute Beirut', 'Design Academy Lebanon', 'Art School Textiles Dept',
  // Regular customers
  'Al-Fares Trading', 'Cedar Fabrics', 'Phoenix Textiles',
  'Mediterranean Imports', 'Levant Clothing', 'Byblos Fashion',
  'Sidon Sewing Center', 'Tripoli Textiles', 'Jounieh Boutique',
  'Batroun Fabrics', 'Zahle Tailors', 'Aley Clothing',
  'Broummana Boutique', 'Jbeil Fashion', 'Baalbek Textiles',
  'Anfeh Garments', 'Halba Fabrics Co.', 'Hermel Trading',
];

const SALESPERSON_NAMES = [
  { name: 'Ahmad Hassan', code: 'AH' },
  { name: 'Nour El-Din', code: 'NED' },
  { name: 'Marie Khoury', code: 'MK' },
  { name: 'Ziad Saab', code: 'ZS' },
  { name: 'Layla Fares', code: 'LF' },
];

const SUPPLIER_DATA = [
  { name: 'Turkish Textile Mills', country: 'Turkey', rating: 4.8 },
  { name: 'Shanghai Silk Industries', country: 'China', rating: 4.5 },
  { name: 'Italian Luxury Fabrics SRL', country: 'Italy', rating: 4.9 },
  { name: 'Beirut Local Textiles', country: 'Lebanon', rating: 4.2 },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getSeasonMultiplier(date, season) {
  const month = date.getMonth(); // 0-11
  
  // Summer: June(5), July(6), August(7) - peak for summer fabrics
  // Winter: December(11), January(0), February(1) - peak for winter fabrics
  // Spring: March(2), April(3), May(4)
  // Fall: September(8), October(9), November(10)
  
  if (season === 'summer' && [5, 6, 7].includes(month)) return 2.0;
  if (season === 'winter' && [11, 0, 1].includes(month)) return 2.0;
  if (season === 'spring' && [2, 3, 4].includes(month)) return 1.5;
  if (season === 'fall' && [8, 9, 10].includes(month)) return 1.5;
  if (season === 'all') return 1.0;
  
  return 0.5; // Off-season
}

function formatDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

// ============================================
// DATABASE CONNECTION
// ============================================

async function getConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// ============================================
// DATA GENERATION FUNCTIONS
// ============================================

async function generateFabrics(conn) {
  console.log('📦 Generating fabrics...');
  
  const fabricIds = [];
  
  for (let i = 0; i < FABRIC_TEMPLATES.length; i++) {
    const template = FABRIC_TEMPLATES[i];
    const fabricCode = `${template.code}-${randomInt(100, 999)}`;
    
    const [result] = await conn.query(
      `INSERT INTO fabrics (fabric_name, fabric_code, main_code, source, design, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE fabric_id=LAST_INSERT_ID(fabric_id)`,
      [
        template.name,
        fabricCode,
        template.code,
        template.type,
        randomElement(['plain', 'printed', 'striped', 'checkered']),
        formatDate(CONFIG.START_DATE),
      ]
    );
    
    fabricIds.push({
      id: result.insertId,
      ...template,
      code: fabricCode,
    });
  }
  
  console.log(`✅ Created ${fabricIds.length} fabrics`);
  return fabricIds;
}

async function generateColors(conn, fabrics) {
  console.log('🎨 Generating colors...');
  
  const colorIds = [];
  
  for (const fabric of fabrics) {
    const colorCount = randomInt(3, 7);
    const usedColors = new Set();
    
    for (let i = 0; i < colorCount; i++) {
      let colorName = randomElement(COLOR_NAMES);
      
      // Avoid duplicates
      while (usedColors.has(colorName)) {
        colorName = randomElement(COLOR_NAMES);
      }
      usedColors.add(colorName);
      
      const initialStock = randomFloat(50, 500, 2);
      const arrivalDate = addDays(
        CONFIG.START_DATE,
        randomInt(-30, 0) // Arrived 0-30 days before simulation start
      );
      
      const [result] = await conn.query(
        `INSERT INTO colors 
         (fabric_id, color_name, length_meters, length_yards, date, weight, lot, roll_nb, status, sold, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', 0, ?)`,
        [
          fabric.id,
          colorName,
          initialStock,
          initialStock * 1.09361, // meters to yards
          formatDateOnly(arrivalDate),
          randomElement(['120gsm', '150gsm', '180gsm', '200gsm', '250gsm']),
          `LOT-${randomInt(1000, 9999)}`,
          `ROLL-${randomInt(100, 999)}`,
          formatDate(arrivalDate),
        ]
      );
      
      colorIds.push({
        id: result.insertId,
        fabricId: fabric.id,
        fabricName: fabric.name,
        colorName,
        season: fabric.season,
        currentStock: initialStock,
        cost: fabric.cost,
        price: fabric.price,
      });
    }
  }
  
  console.log(`✅ Created ${colorIds.length} color variants`);
  return colorIds;
}

async function generateCustomers(conn) {
  console.log('👥 Generating customers...');
  
  const customerIds = [];
  
  for (let i = 0; i < CONFIG.CUSTOMERS_COUNT; i++) {
    const customerName = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];
    
    const [result] = await conn.query(
      `INSERT INTO customers (customer_name, phone, email, notes, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE customer_id=LAST_INSERT_ID(customer_id)`,
      [
        customerName,
        `+961 ${randomInt(70, 79)} ${randomInt(100000, 999999)}`,
        customerName.toLowerCase().replace(/\s+/g, '') + '@example.com',
        randomElement(['VIP customer', 'Regular buyer', 'Wholesale client', 'Occasional', '']),
        formatDate(CONFIG.START_DATE),
      ]
    );
    
    // Assign customer tier (affects buying frequency)
    const tier = i < 5 ? 'VIP' : i < 15 ? 'Regular' : 'Occasional';
    
    customerIds.push({
      id: result.insertId,
      name: customerName,
      tier,
    });
  }
  
  console.log(`✅ Created ${customerIds.length} customers`);
  return customerIds;
}

async function generateSalespersons(conn) {
  console.log('💼 Generating salespersons...');
  
  const salespersonIds = [];
  
  for (const sp of SALESPERSON_NAMES) {
    const [result] = await conn.query(
      `INSERT INTO salespersons (name, code, email, phone, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE salesperson_id=LAST_INSERT_ID(salesperson_id)`,
      [
        sp.name,
        sp.code,
        sp.name.toLowerCase().replace(/\s+/g, '.') + '@risetexco.com',
        `+961 ${randomInt(70, 79)} ${randomInt(100000, 999999)}`,
        formatDate(CONFIG.START_DATE),
      ]
    );
    
    salespersonIds.push({
      id: result.insertId,
      name: sp.name,
    });
  }
  
  console.log(`✅ Created ${salespersonIds.length} salespersons`);
  return salespersonIds;
}

async function generateSuppliers(conn) {
  console.log('🏭 Generating suppliers...');
  
  const supplierIds = [];
  
  for (const supplier of SUPPLIER_DATA) {
    const [result] = await conn.query(
      `INSERT INTO suppliers 
       (supplier_name, company_name, country, payment_terms, rating, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE supplier_id=LAST_INSERT_ID(supplier_id)`,
      [
        supplier.name,
        supplier.name + ' Ltd.',
        supplier.country,
        randomElement(['Net 30', 'Net 45', 'Net 60', 'COD']),
        supplier.rating,
        formatDate(CONFIG.START_DATE),
      ]
    );
    
    supplierIds.push({
      id: result.insertId,
      name: supplier.name,
      country: supplier.country,
    });
  }
  
  console.log(`✅ Created ${supplierIds.length} suppliers`);
  return supplierIds;
}

async function generateProcurementOrders(conn, fabrics, suppliers, colors) {
  console.log('📋 Generating procurement orders...');
  
  const orders = [];
  let orderNumber = 1;
  
  // Generate procurement orders at start of each month
  for (let month = 0; month < CONFIG.MONTHS_TO_SIMULATE; month++) {
    const orderDate = new Date(CONFIG.START_DATE);
    orderDate.setMonth(orderDate.getMonth() + month);
    orderDate.setDate(1); // First of month
    
    // 2-4 orders per month
    const ordersThisMonth = randomInt(2, 4);
    
    for (let i = 0; i < ordersThisMonth; i++) {
      const supplier = randomElement(suppliers);
      const orderDateOffset = addDays(orderDate, randomInt(0, 10));
      const expectedDelivery = addDays(orderDateOffset, randomInt(20, 45));
      const actualDelivery = addDays(expectedDelivery, randomInt(-3, 7)); // Sometimes late
      
      const orderNum = `PO-2025-${String(orderNumber++).padStart(4, '0')}`;
      
      // Insert order
      const [orderResult] = await conn.query(
        `INSERT INTO procurement_orders 
         (order_number, supplier_id, order_date, expected_delivery_date, 
          actual_delivery_date, status, currency, created_at)
         VALUES (?, ?, ?, ?, ?, 'delivered', 'USD', ?)`,
        [
          orderNum,
          supplier.id,
          formatDateOnly(orderDateOffset),
          formatDateOnly(expectedDelivery),
          formatDateOnly(actualDelivery),
          formatDate(orderDateOffset),
        ]
      );
      
      const orderId = orderResult.insertId;
      
      // Add 2-5 items per order
      const itemCount = randomInt(2, 5);
      let totalOrderCost = 0;
      
      for (let j = 0; j < itemCount; j++) {
        const fabric = randomElement(fabrics);
        const color = randomElement(colors.filter(c => c.fabricId === fabric.id));
        const quantity = randomFloat(100, 500, 2);
        const unitCost = fabric.cost * randomFloat(0.9, 1.1, 2); // Price variation
        const totalCost = quantity * unitCost;
        
        totalOrderCost += totalCost;
        
        await conn.query(
          `INSERT INTO procurement_order_items 
           (order_id, fabric_id, fabric_name, fabric_code, color_name, 
            quantity_meters, roll_count, unit_cost, total_cost, received_meters, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            fabric.id,
            fabric.name,
            fabric.code,
            color.colorName,
            quantity,
            randomInt(5, 15),
            unitCost,
            totalCost,
            quantity, // Assume full delivery
            formatDate(orderDateOffset),
          ]
        );
        
        // Update color stock (simulate receiving inventory)
        await conn.query(
          `UPDATE colors 
           SET length_meters = length_meters + ?,
               length_yards = length_yards + ?
           WHERE color_id = ?`,
          [quantity, quantity * 1.09361, color.id]
        );
      }
      
      // Update total order cost
      await conn.query(
        `UPDATE procurement_orders SET total_cost = ? WHERE order_id = ?`,
        [totalOrderCost, orderId]
      );
      
      orders.push({ id: orderId, orderNum, totalCost: totalOrderCost });
    }
  }
  
  console.log(`✅ Created ${orders.length} procurement orders`);
  return orders;
}

async function generatePricingHistory(conn, fabrics, colors) {
  console.log('💰 Generating pricing history...');
  
  let priceRecords = 0;
  
  for (const fabric of fabrics) {
    const relatedColors = colors.filter(c => c.fabricId === fabric.id);
    
    // Create initial price (6 months ago)
    const effectiveFrom = new Date(CONFIG.START_DATE);
    effectiveFrom.setMonth(effectiveFrom.getMonth() - 1);
    
    await conn.query(
      `INSERT INTO pricing_history 
       (fabric_id, color_id, cost_per_meter, sale_price_per_meter, 
        effective_from, effective_to, currency, created_at)
       VALUES (?, NULL, ?, ?, ?, NULL, 'USD', ?)`,
      [
        fabric.id,
        fabric.cost,
        fabric.price,
        formatDateOnly(effectiveFrom),
        formatDate(effectiveFrom),
      ]
    );
    
    priceRecords++;
    
    // 30% chance of price change during simulation period
    if (Math.random() < 0.3) {
      const priceChangeDate = addDays(CONFIG.START_DATE, randomInt(30, 150));
      const newCost = fabric.cost * randomFloat(0.95, 1.15, 2);
      const newPrice = fabric.price * randomFloat(0.95, 1.15, 2);
      
      // Close previous price record
      await conn.query(
        `UPDATE pricing_history 
         SET effective_to = ?
         WHERE fabric_id = ? AND effective_to IS NULL`,
        [formatDateOnly(addDays(priceChangeDate, -1)), fabric.id]
      );
      
      // Insert new price
      await conn.query(
        `INSERT INTO pricing_history 
         (fabric_id, color_id, cost_per_meter, sale_price_per_meter, 
          effective_from, effective_to, currency, created_at)
         VALUES (?, NULL, ?, ?, ?, NULL, 'USD', ?)`,
        [
          fabric.id,
          newCost,
          newPrice,
          formatDateOnly(priceChangeDate),
          formatDate(priceChangeDate),
        ]
      );
      
      priceRecords++;
    }
  }
  
  console.log(`✅ Created ${priceRecords} pricing records`);
}

async function generateTransactions(conn, colors, customers, salespersons) {
  console.log('💸 Generating transactions (this may take a while)...');
  
  const totalDays = CONFIG.MONTHS_TO_SIMULATE * 30;
  let transactionCount = 0;
  let groupCount = 0;
  
  for (let day = 0; day < totalDays; day++) {
    const currentDate = addDays(CONFIG.START_DATE, day);
    
    // Skip some days (weekends have less activity)
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let transactionsToday = randomInt(
      isWeekend ? 2 : 5,
      isWeekend ? 6 : CONFIG.TRANSACTIONS_PER_DAY_AVG + 3
    );
    
    for (let t = 0; t < transactionsToday; t++) {
      // Select customer (VIPs more likely to buy)
      const customer = randomElement(customers);
      const isBulkOrder = customer.tier === 'VIP' && Math.random() < 0.3;
      
      // Select salesperson
      const salesperson = randomElement(salespersons);
      
      // Create transaction group
      const timestamp = new Date(currentDate);
      timestamp.setHours(randomInt(9, 18), randomInt(0, 59), 0);
      const epoch = timestamp.getTime();
      
      const transactionGroupId = `TG-${epoch}-${randomInt(1000, 9999)}`;
      const permitNumber = `P-${String(groupCount + 1).padStart(6, '0')}`;
      
      // Determine items in this transaction (1-4 different fabrics)
      const itemCount = isBulkOrder ? randomInt(3, 6) : randomInt(1, 3);
      let totalMeters = 0;
      
      // Create transaction group
      await conn.query(
        `INSERT INTO transaction_groups 
         (transaction_group_id, permit_number, transaction_type, customer_id, customer_name,
          transaction_date, epoch, timezone, total_items, total_meters, created_at)
         VALUES (?, ?, 'S', ?, ?, ?, ?, 'Asia/Beirut', ?, 0, ?)`,
        [
          transactionGroupId,
          permitNumber,
          customer.id,
          customer.name,
          formatDate(timestamp),
          epoch,
          itemCount,
          formatDate(timestamp),
        ]
      );
      
      groupCount++;
      
      // Add items to transaction
      for (let i = 0; i < itemCount; i++) {
        // Pick color with seasonal preference
        const availableColors = colors.filter(c => {
          const seasonMultiplier = getSeasonMultiplier(currentDate, c.season);
          return c.currentStock > 5 && Math.random() < (seasonMultiplier * 0.5);
        });
        
        if (availableColors.length === 0) continue;
        
        const color = randomElement(availableColors);
        
        // Determine sale amount
        let saleAmount;
        if (isBulkOrder) {
          saleAmount = randomFloat(50, 200, 2);
        } else {
          saleAmount = randomFloat(10, 80, 2);
        }
        
        // Don't oversell
        saleAmount = Math.min(saleAmount, color.currentStock - 1);
        
        if (saleAmount < 5) continue;
        
        // Insert log
        await conn.query(
          `INSERT INTO logs 
           (type, fabric_id, color_id, customer_id, salesperson_id, 
            fabric_name, color_name, customer_name, amount_meters, roll_count,
            weight, lot, roll_nb, notes, timestamp, epoch, timezone,
            transaction_group_id, created_at)
           VALUES 
           ('sell', ?, ?, ?, ?,
            ?, ?, ?, ?, 0,
            ?, ?, ?, '', ?, ?, 'Asia/Beirut',
            ?, ?)`,
          [
            color.fabricId,
            color.id,
            customer.id,
            salesperson.id,
            color.fabricName,
            color.colorName,
            customer.name,
            saleAmount,
            randomElement(['120gsm', '150gsm', '180gsm']),
            `LOT-${randomInt(1000, 9999)}`,
            `ROLL-${randomInt(100, 999)}`,
            formatDate(timestamp),
            epoch,
            transactionGroupId,
            formatDate(timestamp),
          ]
        );
        
        // Update color stock
        color.currentStock -= saleAmount;
        await conn.query(
          `UPDATE colors 
           SET length_meters = length_meters - ?,
               length_yards = length_yards - ?
           WHERE color_id = ?`,
          [saleAmount, saleAmount * 1.09361, color.id]
        );
        
        totalMeters += saleAmount;
        transactionCount++;
      }
      
      // Update transaction group totals
      await conn.query(
        `UPDATE transaction_groups 
         SET total_meters = ?
         WHERE transaction_group_id = ?`,
        [totalMeters, transactionGroupId]
      );
    }
    
    // Progress indicator
    if (day % 30 === 0) {
      console.log(`  📅 Month ${Math.floor(day / 30) + 1}/${CONFIG.MONTHS_TO_SIMULATE} - ${transactionCount} transactions created`);
    }
  }
  
  console.log(`✅ Created ${transactionCount} transactions in ${groupCount} groups`);
}

async function generateInventorySnapshots(conn, colors) {
  console.log('📸 Generating inventory snapshots...');
  
  let snapshotCount = 0;
  
  // Create weekly snapshots
  for (let week = 0; week < CONFIG.MONTHS_TO_SIMULATE * 4; week++) {
    const snapshotDate = addDays(CONFIG.START_DATE, week * 7);
    
    for (const color of colors) {
      // Get current stock
      const [rows] = await conn.query(
        `SELECT length_meters, length_yards FROM colors WHERE color_id = ?`,
        [color.id]
      );
      
      if (rows.length === 0) continue;
      
      const stock = rows[0];
      
      await conn.query(
        `INSERT INTO inventory_snapshots 
         (snapshot_date, snapshot_time, fabric_id, color_id, 
          stock_meters, stock_yards, roll_count, available_meters, sold_meters,
          value_at_cost, value_at_sale_price, created_at)
         VALUES (?, '23:59:59', ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`,
        [
          formatDateOnly(snapshotDate),
          color.fabricId,
          color.id,
          stock.length_meters,
          stock.length_yards,
          stock.length_meters,
          stock.length_meters * color.cost,
          stock.length_meters * color.price,
          formatDate(snapshotDate),
        ]
      );
      
      snapshotCount++;
    }
  }
  
  console.log(`✅ Created ${snapshotCount} inventory snapshots`);
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('🚀 RisetexCo Data Simulation Starting...\n');
  console.log(`Configuration:`);
  console.log(`  - Months to simulate: ${CONFIG.MONTHS_TO_SIMULATE}`);
  console.log(`  - Start date: ${CONFIG.START_DATE.toISOString().slice(0, 10)}`);
  console.log(`  - Fabrics: ${FABRIC_TEMPLATES.length}`);
  console.log(`  - Customers: ${CONFIG.CUSTOMERS_COUNT}`);
  console.log(`  - Avg transactions/day: ${CONFIG.TRANSACTIONS_PER_DAY_AVG}\n`);
  
  let conn;
  
  try {
    conn = await getConnection();
    console.log('✅ Connected to MySQL\n');
    
    // Check if BI tables exist
    const [tables] = await conn.query(`SHOW TABLES LIKE 'suppliers'`);
    const biTablesExist = tables.length > 0;
    
    if (!biTablesExist) {
      console.log('⚠️  Warning: BI tables (suppliers, procurement_orders, etc.) not found.');
      console.log('   Run these migrations first:');
      console.log('   - backend/migrate-bi-procurement-system.sql');
      console.log('   - backend/migrate-bi-analytics-tables.sql\n');
      console.log('   Continuing with core tables only...\n');
    }
    
    // Generate data
    const fabrics = await generateFabrics(conn);
    const colors = await generateColors(conn, fabrics);
    const customers = await generateCustomers(conn);
    const salespersons = await generateSalespersons(conn);
    
    if (biTablesExist) {
      const suppliers = await generateSuppliers(conn);
      await generateProcurementOrders(conn, fabrics, suppliers, colors);
      await generatePricingHistory(conn, fabrics, colors);
    }
    
    await generateTransactions(conn, colors, customers, salespersons);
    
    if (biTablesExist) {
      await generateInventorySnapshots(conn, colors);
    }
    
    console.log('\n🎉 Data simulation complete!\n');
    console.log('Next steps:');
    console.log('1. Test AI Agent queries in n8n or MySQL Workbench');
    console.log('2. Run: SELECT * FROM v_top_selling_fabrics_30d LIMIT 10;');
    console.log('3. Run: SELECT * FROM v_stock_velocity WHERE stock_status = \'CRITICAL\';');
    console.log('4. Check procurement recommendations');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the script
main();
