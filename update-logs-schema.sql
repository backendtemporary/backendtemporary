-- SQL script to update logs table: remove is_trimmable, add roll_count
-- For MySQL Workbench 8.0 CE
-- Run these commands one by one

-- Step 1: Remove is_trimmable column (will error if column doesn't exist - that's okay)
ALTER TABLE `logs` DROP COLUMN `is_trimmable`;

-- Step 2: Check if roll_count column already exists before adding
-- If you get an error saying column already exists, skip this step
ALTER TABLE `logs` ADD COLUMN `roll_count` int DEFAULT 0 COMMENT 'Number of rolls this transaction represents (0 for cut pieces)' AFTER `amount_meters`;
