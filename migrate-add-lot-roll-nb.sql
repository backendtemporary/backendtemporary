-- Migration: Add LOT and Roll nb columns to rolls table
-- These fields allow tracking lot numbers and roll numbers for inventory management

-- Step 1: Add LOT column (VARCHAR for flexibility, can store alphanumeric lot numbers)
ALTER TABLE `rolls` 
ADD COLUMN `lot` VARCHAR(50) NULL DEFAULT NULL 
AFTER `weight`;

-- Step 2: Add Roll nb column (VARCHAR for flexibility, can store alphanumeric roll numbers)
ALTER TABLE `rolls` 
ADD COLUMN `roll_nb` VARCHAR(50) NULL DEFAULT NULL 
AFTER `lot`;

-- Step 3: Add indexes for better query performance
CREATE INDEX `idx_rolls_lot` ON `rolls`(`lot`);
CREATE INDEX `idx_rolls_roll_nb` ON `rolls`(`roll_nb`);

-- Note: Both columns are nullable to allow existing records to remain valid
-- You can update existing records with lot/roll_nb values as needed

