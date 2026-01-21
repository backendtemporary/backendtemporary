-- Fresh Database Schema - No Rolls Table
-- Colors table now includes roll attributes directly
-- Compatible with MySQL Workbench 8.0 CE

-- Drop existing tables (if any) except users
-- Must drop in correct order due to foreign key constraints
DROP TABLE IF EXISTS `logs`;
DROP TABLE IF EXISTS `transaction_groups`;
DROP TABLE IF EXISTS `deletion_requests`;
DROP TABLE IF EXISTS `rolls`;  -- Drop rolls first as it references colors
DROP TABLE IF EXISTS `colors`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `salespersons`;
DROP TABLE IF EXISTS `fabrics`;

-- Create fabrics table
CREATE TABLE `fabrics` (
  `fabric_id` int NOT NULL AUTO_INCREMENT,
  `fabric_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fabric_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `main_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `design` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`fabric_id`),
  UNIQUE KEY `fabric_code` (`fabric_code`),
  KEY `idx_fabric_code` (`fabric_code`),
  KEY `idx_fabric_name` (`fabric_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create colors table with roll attributes directly embedded
CREATE TABLE `colors` (
  `color_id` int NOT NULL AUTO_INCREMENT,
  `fabric_id` int NOT NULL,
  `color_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `length_meters` decimal(10,2) DEFAULT 0.00,
  `length_yards` decimal(10,2) DEFAULT 0.00,
  `date` date DEFAULT NULL,
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lot` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `sold` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`color_id`),
  UNIQUE KEY `unique_fabric_color` (`fabric_id`,`color_name`),
  KEY `idx_fabric_id` (`fabric_id`),
  KEY `idx_color_name` (`color_name`),
  KEY `idx_status` (`status`),
  KEY `idx_sold` (`sold`),
  KEY `idx_date` (`date`),
  CONSTRAINT `colors_ibfk_1` FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_length_positive` CHECK (`length_meters` >= 0 AND `length_yards` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customers table
CREATE TABLE `customers` (
  `customer_id` int NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `uniq_customer_name` (`customer_name`),
  KEY `idx_customer_name` (`customer_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Create salespersons table
CREATE TABLE `salespersons` (
  `salesperson_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`salesperson_id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_name` (`name`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create transaction_groups table
CREATE TABLE `transaction_groups` (
  `transaction_group_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `permit_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_type` varchar(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_date` datetime NOT NULL,
  `epoch` bigint NOT NULL,
  `timezone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Beirut',
  `total_items` int NOT NULL DEFAULT '0',
  `total_meters` decimal(10,2) DEFAULT '0.00',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`transaction_group_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_date` (`epoch`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_permit_number` (`permit_number`),
  KEY `idx_transaction_type` (`transaction_type`),
  CONSTRAINT `transaction_groups_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create logs table (NO roll_id FK, but keeps roll attributes like lot, roll_nb)
CREATE TABLE `logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'sell, cancel, trim, batch, etc.',
  `fabric_id` int DEFAULT NULL,
  `color_id` int DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `salesperson_id` int DEFAULT NULL,
  `conducted_by_user_id` int DEFAULT NULL,
  `fabric_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount_meters` decimal(10,2) DEFAULT NULL,
  `roll_count` int DEFAULT 0 COMMENT 'Number of rolls this transaction represents (0 for cut pieces)',
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lot` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `timestamp` datetime NOT NULL,
  `epoch` bigint DEFAULT NULL,
  `timezone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Beirut',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `transaction_group_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_log_id` int DEFAULT NULL,
  PRIMARY KEY (`log_id`),
  KEY `idx_type` (`type`),
  KEY `idx_fabric_id` (`fabric_id`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_epoch` (`epoch`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_logs_fabric_id` (`fabric_id`),
  KEY `idx_logs_color_id` (`color_id`),
  KEY `idx_logs_customer_id` (`customer_id`),
  KEY `idx_transaction_group_id` (`transaction_group_id`),
  KEY `idx_transaction_group` (`transaction_group_id`),
  KEY `idx_salesperson` (`salesperson_id`),
  KEY `idx_conducted_by` (`conducted_by_user_id`),
  KEY `idx_reference_log` (`reference_log_id`),
  CONSTRAINT `fk_logs_conducted_by_user` FOREIGN KEY (`conducted_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_fabric` FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_reference_log` FOREIGN KEY (`reference_log_id`) REFERENCES `logs` (`log_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `salespersons` (`salesperson_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_transaction_group` FOREIGN KEY (`transaction_group_id`) REFERENCES `transaction_groups` (`transaction_group_id`) ON DELETE SET NULL,
  CONSTRAINT `logs_ibfk_3` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create deletion_requests table
CREATE TABLE `deletion_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `requested_by_user_id` int NOT NULL,
  `request_type` enum('delete_fabric','delete_color','cancel_transaction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL COMMENT 'ID of the item to delete (fabric_id, color_id, or log_id)',
  `target_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable name of the item',
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `approved_by_user_id` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `idx_status` (`status`),
  KEY `idx_request_type` (`request_type`),
  KEY `idx_requested_by` (`requested_by_user_id`),
  KEY `idx_approved_by` (`approved_by_user_id`),
  CONSTRAINT `deletion_requests_ibfk_1` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `deletion_requests_ibfk_2` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
