-- Add roll_count column to colors table
-- For MySQL Workbench 8.0 CE
-- Run this script to add roll_count attribute to each fabric color
-- If column already exists, you'll get an error - that's okay, just ignore it

-- Check if column exists first (MySQL 8.0 CE compatible)
-- If you get "Duplicate column name" error, the column already exists - you can skip this
ALTER TABLE `colors` ADD COLUMN `roll_count` int DEFAULT 0 COMMENT 'Number of rolls for this color (metadata only)' AFTER `length_yards`;
