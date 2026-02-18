-- ============================================
-- COMPREHENSIVE AUDIT LOG SYSTEM (MySQL 5.6+ Compatible)
-- Tracks all changes to the database
-- Uses TEXT instead of JSON for older MySQL versions
-- ============================================

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `audit_id` INT PRIMARY KEY AUTO_INCREMENT,
  `table_name` VARCHAR(100) NOT NULL COMMENT 'Name of the table that was changed',
  `record_id` INT NOT NULL COMMENT 'ID of the record that was changed',
  `action` ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL COMMENT 'Type of action performed',
  `user_id` INT NULL COMMENT 'User who performed the action',
  `username` VARCHAR(100) NULL COMMENT 'Username for quick reference',
  `field_name` VARCHAR(100) NULL COMMENT 'Field that was changed (for UPDATE actions)',
  `old_value` TEXT NULL COMMENT 'Previous value (for UPDATE/DELETE)',
  `new_value` TEXT NULL COMMENT 'New value (for INSERT/UPDATE)',
  `changes` TEXT NULL COMMENT 'Full JSON object of all changes (for UPDATE with multiple fields) - stored as TEXT for compatibility',
  `ip_address` VARCHAR(45) NULL COMMENT 'IP address of the user',
  `user_agent` TEXT NULL COMMENT 'User agent string',
  `notes` TEXT NULL COMMENT 'Additional context or notes',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_table_record` (`table_name`, `record_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_table_action` (`table_name`, `action`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
