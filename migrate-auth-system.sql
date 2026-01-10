-- ============================================
-- AUTHENTICATION & AUTHORIZATION SYSTEM
-- ============================================

-- Step 1: Create users table
CREATE TABLE `users` (
  `user_id` INT PRIMARY KEY AUTO_INCREMENT,
  `username` VARCHAR(100) UNIQUE NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'limited') NOT NULL DEFAULT 'limited',
  `full_name` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_username` (`username`),
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Create deletion_requests table (for limited users to request deletions)
CREATE TABLE `deletion_requests` (
  `request_id` INT PRIMARY KEY AUTO_INCREMENT,
  `requested_by_user_id` INT NOT NULL,
  `request_type` ENUM('delete_fabric', 'delete_color', 'delete_roll', 'cancel_transaction') NOT NULL,
  `target_id` INT NOT NULL COMMENT 'ID of the item to delete (fabric_id, color_id, roll_id, or log_id)',
  `target_name` VARCHAR(255) COMMENT 'Human-readable name of the item',
  `reason` TEXT,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by_user_id` INT NULL COMMENT 'Admin who reviewed the request',
  `reviewed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  INDEX `idx_status` (`status`),
  INDEX `idx_requested_by` (`requested_by_user_id`),
  INDEX `idx_request_type` (`request_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Note about creating admin user
-- You will create the admin user through the application registration endpoint
-- Or manually insert with a bcrypt-hashed password
-- Example (replace 'hashed_password' with actual bcrypt hash):
-- INSERT INTO `users` (`username`, `email`, `password_hash`, `role`, `full_name`) 
-- VALUES ('admin', 'admin@risetexco.com', 'hashed_password', 'admin', 'Administrator');

