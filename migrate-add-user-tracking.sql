-- ============================================
-- ADD USER TRACKING TO ALL TABLES
-- Tracks who created and updated each record
-- ============================================

-- Add created_by_user_id and updated_by_user_id to fabrics table
ALTER TABLE `fabrics`
ADD COLUMN `created_by_user_id` INT NULL AFTER `updated_at`,
ADD COLUMN `updated_by_user_id` INT NULL AFTER `created_by_user_id`,
ADD INDEX `idx_created_by` (`created_by_user_id`),
ADD INDEX `idx_updated_by` (`updated_by_user_id`),
ADD CONSTRAINT `fk_fabrics_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_fabrics_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

-- Add created_by_user_id and updated_by_user_id to colors table
ALTER TABLE `colors`
ADD COLUMN `created_by_user_id` INT NULL AFTER `updated_at`,
ADD COLUMN `updated_by_user_id` INT NULL AFTER `created_by_user_id`,
ADD INDEX `idx_created_by` (`created_by_user_id`),
ADD INDEX `idx_updated_by` (`updated_by_user_id`),
ADD CONSTRAINT `fk_colors_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_colors_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

-- Add created_by_user_id and updated_by_user_id to customers table
ALTER TABLE `customers`
ADD COLUMN `created_by_user_id` INT NULL AFTER `updated_at`,
ADD COLUMN `updated_by_user_id` INT NULL AFTER `created_by_user_id`,
ADD INDEX `idx_created_by` (`created_by_user_id`),
ADD INDEX `idx_updated_by` (`updated_by_user_id`),
ADD CONSTRAINT `fk_customers_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_customers_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

-- Add created_by_user_id and updated_by_user_id to salespersons table
ALTER TABLE `salespersons`
ADD COLUMN `created_by_user_id` INT NULL AFTER `updated_at`,
ADD COLUMN `updated_by_user_id` INT NULL AFTER `created_by_user_id`,
ADD INDEX `idx_created_by` (`created_by_user_id`),
ADD INDEX `idx_updated_by` (`updated_by_user_id`),
ADD CONSTRAINT `fk_salespersons_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_salespersons_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

-- Add created_by_user_id and updated_by_user_id to color_lots table
ALTER TABLE `color_lots`
ADD COLUMN `created_by_user_id` INT NULL AFTER `updated_at`,
ADD COLUMN `updated_by_user_id` INT NULL AFTER `created_by_user_id`,
ADD INDEX `idx_created_by` (`created_by_user_id`),
ADD INDEX `idx_updated_by` (`updated_by_user_id`),
ADD CONSTRAINT `fk_color_lots_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_color_lots_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;
