-- Add initial_length columns to color_lots table
-- For MySQL Workbench 8.0 CE
-- These columns store the first length entered when a lot is created

ALTER TABLE `color_lots` 
ADD COLUMN `initial_length_meters` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in meters (first non-zero length)' AFTER `length_yards`,
ADD COLUMN `initial_length_yards` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in yards (first non-zero length)' AFTER `initial_length_meters`;
