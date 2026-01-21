-- SQL script to remove is_trimmable column from colors table
-- For MySQL Workbench 8.0 CE
-- Run this if the column exists

-- First, check if column exists, then remove it
-- If column doesn't exist, you'll get an error - that's okay, just ignore it
ALTER TABLE `colors` DROP COLUMN `is_trimmable`;
