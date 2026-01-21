-- Migration: Move roll functionality to color attributes
-- This migration aggregates roll data into colors and removes the rolls table

-- Step 1: Add roll attributes to colors table
ALTER TABLE `colors` 
ADD COLUMN `length_meters` DECIMAL(10,2) DEFAULT 0.00 AFTER `color_name`,
ADD COLUMN `length_yards` DECIMAL(10,2) DEFAULT 0.00 AFTER `length_meters`,
ADD COLUMN `date` DATE NULL AFTER `length_yards`,
ADD COLUMN `is_trimmable` TINYINT(1) DEFAULT 0 AFTER `date`,
ADD COLUMN `weight` VARCHAR(50) DEFAULT 'N/A' AFTER `is_trimmable`,
ADD COLUMN `lot` VARCHAR(50) NULL AFTER `weight`,
ADD COLUMN `roll_nb` VARCHAR(50) NULL AFTER `lot`,
ADD COLUMN `status` VARCHAR(50) DEFAULT 'available' AFTER `roll_nb`,
ADD COLUMN `sold` TINYINT(1) DEFAULT 0 AFTER `status`;

-- Step 2: Aggregate roll data into colors
-- Sum lengths, use earliest date, combine lot/roll_nb values
UPDATE `colors` c
SET 
  `length_meters` = COALESCE((
    SELECT SUM(`length_meters`) 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
  ), 0),
  `length_yards` = COALESCE((
    SELECT SUM(`length_yards`) 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
  ), 0),
  `date` = (
    SELECT MIN(`date`) 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
    LIMIT 1
  ),
  `is_trimmable` = COALESCE((
    SELECT MAX(`is_trimmable`) 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
  ), 0),
  `weight` = COALESCE((
    SELECT GROUP_CONCAT(DISTINCT `weight` SEPARATOR ', ') 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
      AND `weight` IS NOT NULL 
      AND `weight` != 'N/A'
    LIMIT 1
  ), 'N/A'),
  `lot` = COALESCE((
    SELECT GROUP_CONCAT(DISTINCT `lot` SEPARATOR ', ') 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
      AND `lot` IS NOT NULL 
      AND `lot` != ''
    LIMIT 1
  ), NULL),
  `roll_nb` = COALESCE((
    SELECT GROUP_CONCAT(DISTINCT `roll_nb` SEPARATOR ', ') 
    FROM `rolls` r 
    WHERE r.`color_id` = c.`color_id` 
      AND (r.`sold` = FALSE OR r.`sold` IS NULL)
      AND `roll_nb` IS NOT NULL 
      AND `roll_nb` != ''
    LIMIT 1
  ), NULL),
  `status` = CASE 
    WHEN EXISTS (
      SELECT 1 FROM `rolls` r 
      WHERE r.`color_id` = c.`color_id` 
        AND (r.`sold` = FALSE OR r.`sold` IS NULL)
    ) THEN 'available'
    ELSE 'unavailable'
  END,
  `sold` = CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM `rolls` r 
      WHERE r.`color_id` = c.`color_id` 
        AND (r.`sold` = FALSE OR r.`sold` IS NULL)
    ) THEN 1
    ELSE 0
  END
WHERE EXISTS (
  SELECT 1 FROM `rolls` r WHERE r.`color_id` = c.`color_id`
);

-- Step 3: Drop foreign key constraints from logs table that reference rolls
-- Note: We'll need to update logs to reference colors instead, but for now we keep roll_id as nullable
-- ALTER TABLE `logs` MODIFY `roll_id` INT NULL;

-- Step 4: Drop the rolls table (after verifying data migration)
-- CAUTION: Make sure all data is migrated before running this!
-- DROP TABLE IF EXISTS `rolls`;
