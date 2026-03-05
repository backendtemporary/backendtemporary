-- ============================================
-- BUSINESS INTELLIGENCE: SALES ANALYTICS
-- Pre-aggregated tables for fast AI Agent queries
-- ============================================

-- Daily sales metrics (pre-computed for speed)
CREATE TABLE IF NOT EXISTS `sales_metrics_daily` (
  `metric_id` INT PRIMARY KEY AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `fabric_id` INT NULL,
  `color_id` INT NULL,
  `customer_id` INT NULL,
  `salesperson_id` INT NULL,
  `total_transactions` INT DEFAULT 0,
  `total_meters_sold` DECIMAL(12,2) DEFAULT 0.00,
  `total_yards_sold` DECIMAL(12,2) DEFAULT 0.00,
  `total_revenue` DECIMAL(12,2) DEFAULT 0.00 COMMENT 'If pricing data available',
  `total_cost` DECIMAL(12,2) DEFAULT 0.00,
  `total_profit` DECIMAL(12,2) DEFAULT 0.00,
  `unique_customers` INT DEFAULT 0,
  `average_transaction_size_meters` DECIMAL(10,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_date` (`date`),
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_color` (`color_id`),
  INDEX `idx_customer` (`customer_id`),
  INDEX `idx_salesperson` (`salesperson_id`),
  INDEX `idx_date_fabric` (`date`, `fabric_id`),
  UNIQUE KEY `uniq_daily_metric` (`date`, `fabric_id`, `color_id`, `customer_id`, `salesperson_id`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE,
  FOREIGN KEY (`salesperson_id`) REFERENCES `salespersons` (`salesperson_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory snapshots (point-in-time stock levels)
CREATE TABLE IF NOT EXISTS `inventory_snapshots` (
  `snapshot_id` INT PRIMARY KEY AUTO_INCREMENT,
  `snapshot_date` DATE NOT NULL,
  `snapshot_time` TIME DEFAULT '23:59:59' COMMENT 'End-of-day snapshot',
  `fabric_id` INT NOT NULL,
  `color_id` INT NULL,
  `stock_meters` DECIMAL(10,2) NOT NULL,
  `stock_yards` DECIMAL(10,2) NOT NULL,
  `roll_count` INT DEFAULT 0,
  `available_meters` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Not sold or reserved',
  `sold_meters` DECIMAL(10,2) DEFAULT 0.00,
  `value_at_cost` DECIMAL(12,2) DEFAULT 0.00 COMMENT 'stock_meters * cost_per_meter',
  `value_at_sale_price` DECIMAL(12,2) DEFAULT 0.00,
  `days_in_stock` INT GENERATED ALWAYS AS (
    DATEDIFF(snapshot_date, DATE(created_at))
  ) VIRTUAL COMMENT 'Age of inventory',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_snapshot_date` (`snapshot_date`),
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_color` (`color_id`),
  INDEX `idx_date_fabric` (`snapshot_date`, `fabric_id`),
  UNIQUE KEY `uniq_snapshot` (`snapshot_date`, `snapshot_time`, `fabric_id`, `color_id`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer analytics (RFM - Recency, Frequency, Monetary)
CREATE TABLE IF NOT EXISTS `customer_analytics` (
  `analytics_id` INT PRIMARY KEY AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `first_purchase_date` DATE NULL,
  `last_purchase_date` DATE NULL,
  `days_since_last_purchase` INT GENERATED ALWAYS AS (
    DATEDIFF(CURRENT_DATE, last_purchase_date)
  ) VIRTUAL COMMENT 'Recency',
  `total_purchases` INT DEFAULT 0 COMMENT 'Frequency',
  `total_meters_purchased` DECIMAL(12,2) DEFAULT 0.00,
  `total_revenue` DECIMAL(12,2) DEFAULT 0.00 COMMENT 'Monetary Value',
  `average_transaction_value` DECIMAL(10,2) DEFAULT 0.00,
  `favorite_fabric_id` INT NULL,
  `favorite_color_id` INT NULL,
  `customer_segment` ENUM('VIP', 'Regular', 'Occasional', 'At-Risk', 'Lost') DEFAULT 'Occasional',
  `lifetime_value_score` DECIMAL(5,2) DEFAULT 0.00 COMMENT '0-100 score',
  `last_calculated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_customer` (`customer_id`),
  INDEX `idx_segment` (`customer_segment`),
  INDEX `idx_ltv_score` (`lifetime_value_score` DESC),
  INDEX `idx_last_purchase` (`last_purchase_date`),
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE,
  FOREIGN KEY (`favorite_fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE SET NULL,
  FOREIGN KEY (`favorite_color_id`) REFERENCES `colors` (`color_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fabric performance metrics
CREATE TABLE IF NOT EXISTS `fabric_performance_metrics` (
  `metric_id` INT PRIMARY KEY AUTO_INCREMENT,
  `fabric_id` INT NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `period_type` ENUM('weekly', 'monthly', 'quarterly', 'yearly') DEFAULT 'monthly',
  `total_meters_sold` DECIMAL(12,2) DEFAULT 0.00,
  `total_meters_added` DECIMAL(12,2) DEFAULT 0.00 COMMENT 'New stock received',
  `total_revenue` DECIMAL(12,2) DEFAULT 0.00,
  `total_cost` DECIMAL(12,2) DEFAULT 0.00,
  `profit_margin_pct` DECIMAL(5,2) DEFAULT 0.00,
  `turnover_rate` DECIMAL(10,4) DEFAULT 0.00 COMMENT 'Sales / Avg Inventory',
  `days_to_sell` INT DEFAULT 0 COMMENT 'Average days in stock before sale',
  `stock_out_days` INT DEFAULT 0 COMMENT 'Days with zero stock',
  `top_customer_id` INT NULL,
  `top_salesperson_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_period` (`period_start`, `period_end`),
  INDEX `idx_period_type` (`period_type`),
  UNIQUE KEY `uniq_fabric_period` (`fabric_id`, `period_start`, `period_end`, `period_type`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`top_customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  FOREIGN KEY (`top_salesperson_id`) REFERENCES `salespersons` (`salesperson_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seasonal trends table
CREATE TABLE IF NOT EXISTS `seasonal_trends` (
  `trend_id` INT PRIMARY KEY AUTO_INCREMENT,
  `fabric_id` INT NULL,
  `color_id` INT NULL,
  `season` ENUM('Spring', 'Summer', 'Fall', 'Winter') NOT NULL,
  `year` INT NOT NULL,
  `average_monthly_sales_meters` DECIMAL(10,2) DEFAULT 0.00,
  `peak_month` INT NULL COMMENT '1-12 for Jan-Dec',
  `peak_month_sales_meters` DECIMAL(10,2) DEFAULT 0.00,
  `trend_direction` ENUM('increasing', 'stable', 'decreasing') DEFAULT 'stable',
  `year_over_year_change_pct` DECIMAL(6,2) DEFAULT 0.00 COMMENT 'vs same season last year',
  `notes` TEXT NULL,
  `calculated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_fabric` (`fabric_id`),
  INDEX `idx_color` (`color_id`),
  INDEX `idx_season_year` (`season`, `year`),
  FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MATERIALIZED VIEWS (Implemented as Tables with Refresh Logic)
-- ============================================

-- Top selling fabrics (last 30/60/90 days)
CREATE OR REPLACE VIEW `v_top_selling_fabrics_30d` AS
SELECT 
  f.fabric_id,
  f.fabric_name,
  f.fabric_code,
  COUNT(DISTINCT l.log_id) AS transaction_count,
  SUM(l.amount_meters) AS total_meters_sold,
  COUNT(DISTINCT l.customer_id) AS unique_customers,
  AVG(l.amount_meters) AS avg_transaction_size,
  DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) AS days_since_last_sale,
  SUM(l.amount_meters) / 30 AS avg_meters_per_day
FROM fabrics f
JOIN logs l ON l.fabric_id = f.fabric_id
WHERE l.type = 'sell'
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
GROUP BY f.fabric_id, f.fabric_name, f.fabric_code
ORDER BY total_meters_sold DESC
LIMIT 20;

-- Customer retention analysis
CREATE OR REPLACE VIEW `v_customer_retention` AS
SELECT 
  c.customer_id,
  c.customer_name,
  COUNT(DISTINCT DATE(l.timestamp)) AS purchase_days,
  COUNT(DISTINCT l.log_id) AS total_transactions,
  MIN(l.timestamp) AS first_purchase,
  MAX(l.timestamp) AS last_purchase,
  DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) AS days_since_last_purchase,
  DATEDIFF(MAX(l.timestamp), MIN(l.timestamp)) AS customer_lifespan_days,
  SUM(l.amount_meters) AS total_meters_purchased,
  CASE 
    WHEN DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) <= 30 THEN 'Active'
    WHEN DATEDIFF(CURRENT_DATE, MAX(l.timestamp)) <= 90 THEN 'At-Risk'
    ELSE 'Lost'
  END AS retention_status
FROM customers c
LEFT JOIN logs l ON l.customer_id = c.customer_id AND l.type = 'sell'
GROUP BY c.customer_id, c.customer_name
ORDER BY last_purchase DESC;

-- Stock depletion velocity (how fast inventory is moving)
CREATE OR REPLACE VIEW `v_stock_velocity` AS
SELECT 
  f.fabric_id,
  f.fabric_name,
  c.color_id,
  c.color_name,
  c.length_meters AS current_stock,
  COALESCE(SUM(l.amount_meters), 0) AS sold_last_30d,
  COALESCE(SUM(l.amount_meters) / 30, 0) AS avg_daily_sales,
  CASE 
    WHEN COALESCE(SUM(l.amount_meters) / 30, 0) = 0 THEN NULL
    ELSE c.length_meters / (SUM(l.amount_meters) / 30)
  END AS days_until_stockout,
  CASE 
    WHEN c.length_meters = 0 THEN 'OUT_OF_STOCK'
    WHEN (c.length_meters / NULLIF((SUM(l.amount_meters) / 30), 0)) < 7 THEN 'CRITICAL'
    WHEN (c.length_meters / NULLIF((SUM(l.amount_meters) / 30), 0)) < 30 THEN 'LOW'
    ELSE 'HEALTHY'
  END AS stock_status
FROM fabrics f
JOIN colors c ON c.fabric_id = f.fabric_id
LEFT JOIN logs l ON l.color_id = c.color_id 
  AND l.type = 'sell' 
  AND l.timestamp >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
WHERE c.sold = 0
GROUP BY f.fabric_id, f.fabric_name, c.color_id, c.color_name, c.length_meters
ORDER BY days_until_stockout ASC;

-- Salesperson performance
CREATE OR REPLACE VIEW `v_salesperson_performance` AS
SELECT 
  sp.salesperson_id,
  sp.name AS salesperson_name,
  COUNT(DISTINCT l.log_id) AS total_sales,
  SUM(l.amount_meters) AS total_meters_sold,
  COUNT(DISTINCT l.customer_id) AS unique_customers,
  COUNT(DISTINCT DATE(l.timestamp)) AS active_days,
  AVG(l.amount_meters) AS avg_sale_size,
  MIN(l.timestamp) AS first_sale,
  MAX(l.timestamp) AS last_sale
FROM salespersons sp
LEFT JOIN logs l ON l.salesperson_id = sp.salesperson_id AND l.type = 'sell'
WHERE sp.active = 1
GROUP BY sp.salesperson_id, sp.name
ORDER BY total_meters_sold DESC;
