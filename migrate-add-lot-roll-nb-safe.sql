-- Migration: Add LOT and Roll nb columns to rolls table
-- Compatible with older MySQL versions
-- These fields allow tracking lot numbers and roll numbers for inventory management

-- Step 1: Add LOT column (VARCHAR for flexibility, can store alphanumeric lot numbers)
-- If column already exists, this will show an error - that's okay, just continue
ALTER TABLE `rolls` 
ADD COLUMN `lot` VARCHAR(50) NULL DEFAULT NULL;

-- Step 2: Add Roll nb column (VARCHAR for flexibility, can store alphanumeric roll numbers)
-- If column already exists, this will show an error - that's okay, just continue
ALTER TABLE `rolls` 
ADD COLUMN `roll_nb` VARCHAR(50) NULL DEFAULT NULL;

-- Step 3: Add indexes for better query performance (only if they don't exist)
-- If index already exists, this will show an error - that's okay, just continue
CREATE INDEX `idx_rolls_lot` ON `rolls`(`lot`);

CREATE INDEX `idx_rolls_roll_nb` ON `rolls`(`roll_nb`);

-- Verification: Check if columns were added successfully
-- Run this to verify:
-- DESCRIBE `rolls`;
-- You should see `lot` and `roll_nb` columns in the output

