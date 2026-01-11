-- ============================================
-- ADD PERMIT NUMBER TO TRANSACTION GROUPS
-- Run cleanup-permit-number.sql first if permit_number already exists
-- ============================================

-- Step 1: Add permit_number column to transaction_groups table
ALTER TABLE `transaction_groups` 
ADD COLUMN `permit_number` INT NULL AFTER `transaction_group_id`,
ADD INDEX `idx_permit_number` (`permit_number`);

-- Step 2: Generate sequential permit numbers for existing transaction groups
-- Using a temporary table approach (works with safe update mode)
CREATE TEMPORARY TABLE IF NOT EXISTS `temp_permit_numbers` (
  `transaction_group_id` VARCHAR(255) COLLATE utf8mb4_unicode_ci,
  `row_num` INT,
  PRIMARY KEY (`transaction_group_id`)
);

-- Populate temp table with sequential numbers (using DISTINCT to handle duplicates)
SET @row_number = 0;
INSERT INTO `temp_permit_numbers` (`transaction_group_id`, `row_num`)
SELECT `transaction_group_id`, @row_number := @row_number + 1
FROM (
  SELECT DISTINCT `transaction_group_id`
  FROM `transaction_groups`
  ORDER BY `transaction_group_id` ASC
) AS distinct_ids;

-- Update transaction_groups using the temp table (has WHERE clause for safe update mode)
UPDATE `transaction_groups` t1
INNER JOIN `temp_permit_numbers` t2 ON t1.`transaction_group_id` = t2.`transaction_group_id`
SET t1.`permit_number` = t2.row_num
WHERE t1.`permit_number` IS NULL;

-- Clean up temp table
DROP TEMPORARY TABLE IF EXISTS `temp_permit_numbers`;

-- Step 3: Make permit_number NOT NULL and UNIQUE after populating existing data
ALTER TABLE `transaction_groups`
MODIFY COLUMN `permit_number` INT NOT NULL,
ADD UNIQUE KEY `unique_permit_number` (`permit_number`);
