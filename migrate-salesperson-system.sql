-- ============================================
-- SALESPERSON & TRANSACTION TRACKING SYSTEM
-- ============================================

-- Step 1: Create salespersons table
CREATE TABLE `salespersons` (
  `salesperson_id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(100) UNIQUE COMMENT 'Optional salesperson code/ID',
  `email` VARCHAR(255),
  `phone` VARCHAR(50),
  `active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`),
  INDEX `idx_code` (`code`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Add new columns to logs table
-- Add salesperson_id (references salespersons table)
ALTER TABLE `logs` 
ADD COLUMN `salesperson_id` INT NULL AFTER `customer_id`,
ADD INDEX `idx_salesperson` (`salesperson_id`);

-- Add foreign key constraint for salesperson
ALTER TABLE `logs`
ADD CONSTRAINT `fk_logs_salesperson` 
FOREIGN KEY (`salesperson_id`) REFERENCES `salespersons` (`salesperson_id`) 
ON DELETE SET NULL;

-- Add conducted_by_user_id (references users table - tracks which logged-in user performed the transaction)
ALTER TABLE `logs`
ADD COLUMN `conducted_by_user_id` INT NULL AFTER `salesperson_id`,
ADD INDEX `idx_conducted_by` (`conducted_by_user_id`);

-- Add foreign key constraint for user who conducted the transaction
ALTER TABLE `logs`
ADD CONSTRAINT `fk_logs_conducted_by_user` 
FOREIGN KEY (`conducted_by_user_id`) REFERENCES `users` (`user_id`) 
ON DELETE SET NULL;

-- Step 3: Note: You may want to add default salespersons
-- INSERT INTO `salespersons` (`name`, `code`) VALUES 
-- ('Salesperson 1', 'SP001'),
-- ('Salesperson 2', 'SP002');

