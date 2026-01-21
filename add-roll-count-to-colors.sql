-- Add roll_count column to colors table
-- For MySQL Workbench 8.0 CE
-- Run this script to add roll_count attribute to each fabric color

ALTER TABLE `colors` ADD COLUMN `roll_count` int DEFAULT 0 COMMENT 'Number of rolls for this color (metadata only)' AFTER `length_yards`;
