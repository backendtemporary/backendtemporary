-- Add unique constraint (fabric_id, color_name, date) to colors table
-- This allows same color name with different dates (old stock vs new stock)
-- Compatible with MySQL 8.0 CE
-- 
-- Note: MySQL treats NULL values in unique constraints specially - 
-- multiple NULLs are allowed, so colors with NULL dates can coexist

-- Drop the old unique constraint
ALTER TABLE `colors` DROP INDEX `unique_fabric_color`;

-- Add new unique constraint including date
-- This allows same color name on different dates but prevents duplicates on same date
ALTER TABLE `colors` 
ADD UNIQUE KEY `unique_fabric_color_date` (`fabric_id`, `color_name`, `date`);
