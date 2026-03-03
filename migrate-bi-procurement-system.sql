-- ============================================
-- BUSINESS INTELLIGENCE: PROCUREMENT SYSTEM
-- Tables to track supplier purchases and costs
-- ============================================

-- Suppliers table
CREATE TABLE IF NOT EXISTS `suppliers` (
  `supplier_id` INT PRIMARY KEY AUTO_INCREMENT,
  `supplier_name` VARCHAR(255) NOT NULL,
  `company_name` VARCHAR(255) NULL,
  `contact_person` VARCHAR(255) NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(50) NULL,
  `address` TEXT NULL,
  `country` VARCHAR(100) NULL,
  `payment_terms` VARCHAR(100) NULL COMMENT 'e.g., Net 30, Net 60, COD',
  `rating` DECIMAL(3,2) DEFAULT 5.00 COMMENT 'Supplier quality rating 1-5',
  `active` BOOLEAN DEFAULT TRUE,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_supplier_name` (`supplier_name`),
  INDEX `idx_active` (`active`),
  INDEX `idx_country` (`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Procurement orders table
CREATE TABLE IF NOT EXISTS `procurement_orders` (
  `order_id` INT PRIMARY KEY AUTO_INCREMENT,
  `order_number` VARCHAR(50) NOT NULL COMMENT 'e.g., PO-2026-001',
  `supplier_id` INT NOT NULL,
  `order_date` DATE NOT NULL,
  `expected_delivery_date` DATE NULL,
  `actual_delivery_date` DATE NULL,
  `status` ENUM('pending', 'ordered', 'in_transit', 'delivered', 'cancelled') DEFAULT 'pending',
  `total_cost` DECIMAL(12,2) DEFAULT 0.00 COMMENT 'Total order cost in USD or local currency',
  `currency` VARCHAR(10) DEFAULT 'USD',
  `shipping_cost` DECIMAL(10,2) DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_by_user_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_order_number` (`order_number`),
  INDEX `idx_supplier` (`supplier_id`),
  INDEX `idx_order_date` (`order_date`),
  INDEX `idx_status` (`status`),
  INDEX `idx_expected_delivery` (`expected_delivery_date`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Procurement order items (individual fabrics in each order)
CREATE TABLE IF NOT EXISTS `procurement_order_items` (
  `item_id` INT PRIMARY KEY AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `fabric_id` INT NULL COMMENT 'Links to existing fabric if already in system',
  `fabric_name` VARCHAR(255) NOT NULL,
  `fabric_code` VARCHAR(50) NULL,
  `color_name` VARCHAR(100) NULL,
  `quantity_meters` DECIMAL(10,2) NOT NULL,
  `quantity_yards` DECIMAL(10,2) GENERATED ALWAYS AS (quantity_meters * 1.09361) STORED,
  `roll_count` INT DEFAULT 0 COMMENT 'Number of rolls ordered',
  `unit_cost` DECIMAL(10,2) NOT NULL COMMENT 'Cost per meter',
  `total_cost` DECIMAL(12,2) NOT NULL COMMENT 'quantity_meters * unit_cost',
  `received_meters` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Actual quantity received',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_order` (`order_id`),
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_fabric_name` (`fabric_name`),
  FOREIGN KEY (`order_id`) REFERENCES `procurement_orders` (`order_id`) ON DELETE CASCADE,
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pricing history table (tracks cost and sale price over time)
CREATE TABLE IF NOT EXISTS `pricing_history` (
  `pricing_id` INT PRIMARY KEY AUTO_INCREMENT,
  `fabric_id` INT NOT NULL,
  `color_id` INT NULL COMMENT 'NULL = applies to all colors of this fabric',
  `cost_per_meter` DECIMAL(10,2) NOT NULL COMMENT 'Purchase cost',
  `sale_price_per_meter` DECIMAL(10,2) NOT NULL COMMENT 'Selling price',
  `margin_percentage` DECIMAL(5,2) GENERATED ALWAYS AS (
    ((sale_price_per_meter - cost_per_meter) / cost_per_meter) * 100
  ) STORED COMMENT 'Profit margin %',
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL COMMENT 'NULL = current price',
  `currency` VARCHAR(10) DEFAULT 'USD',
  `notes` TEXT NULL,
  `created_by_user_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_color` (`color_id`),
  INDEX `idx_effective_dates` (`effective_from`, `effective_to`),
  INDEX `idx_current_prices` (`fabric_id`, `effective_to`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock reorder rules (automate procurement suggestions)
CREATE TABLE IF NOT EXISTS `reorder_rules` (
  `rule_id` INT PRIMARY KEY AUTO_INCREMENT,
  `fabric_id` INT NOT NULL,
  `color_id` INT NULL COMMENT 'NULL = applies to all colors',
  `min_stock_meters` DECIMAL(10,2) NOT NULL COMMENT 'Reorder when stock falls below this',
  `reorder_quantity_meters` DECIMAL(10,2) NOT NULL COMMENT 'How much to order',
  `lead_time_days` INT DEFAULT 30 COMMENT 'Expected delivery time',
  `active` BOOLEAN DEFAULT TRUE,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_color` (`color_id`),
  INDEX `idx_active` (`active`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample supplier data
INSERT INTO `suppliers` (`supplier_name`, `company_name`, `country`, `payment_terms`, `rating`) VALUES
('Turkish Textile Mills', 'TTM Fabrics Ltd.', 'Turkey', 'Net 30', 4.80),
('Shanghai Silk Co.', 'Shanghai Silk Industries', 'China', 'Net 45', 4.50),
('Italian Luxury Fabrics', 'Tessuti Italiani SRL', 'Italy', 'Net 60', 4.95),
('Local Lebanese Supplier', 'Beirut Textiles', 'Lebanon', 'COD', 4.20);

-- Create view for low stock alerts
CREATE OR REPLACE VIEW `v_low_stock_alerts` AS
SELECT 
  rr.rule_id,
  f.fabric_name,
  f.fabric_code,
  c.color_name,
  c.length_meters AS current_stock_meters,
  rr.min_stock_meters AS reorder_threshold,
  rr.reorder_quantity_meters AS suggested_order_qty,
  rr.lead_time_days,
  CASE 
    WHEN c.length_meters < rr.min_stock_meters THEN 'URGENT'
    WHEN c.length_meters < (rr.min_stock_meters * 1.2) THEN 'WARNING'
    ELSE 'OK'
  END AS alert_level,
  s.supplier_name AS preferred_supplier
FROM reorder_rules rr
JOIN fabrics f ON rr.fabric_id = f.fabric_id
LEFT JOIN colors c ON rr.color_id = c.color_id
LEFT JOIN procurement_order_items poi ON poi.fabric_id = f.fabric_id
LEFT JOIN procurement_orders po ON po.order_id = poi.order_id AND po.status = 'delivered'
LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
WHERE rr.active = TRUE
  AND c.length_meters < (rr.min_stock_meters * 1.2)
GROUP BY rr.rule_id, f.fabric_id, c.color_id
ORDER BY alert_level, c.length_meters ASC;
