-- ============================================
-- FIX EXISTING PERMIT NUMBERS - SEQUENTIAL APPROACH
-- ============================================
-- This script fixes permit numbers for existing transactions
-- Uses a safer sequential approach for older MySQL
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- ============================================
-- Step 1: Create temporary table to track permit numbers
-- ============================================
CREATE TEMPORARY TABLE IF NOT EXISTS `temp_permit_fix` (
  `transaction_group_id` VARCHAR(100) PRIMARY KEY,
  `transaction_type` VARCHAR(1),
  `new_permit_number` VARCHAR(20),
  `row_num` INT
);

-- ============================================
-- Step 2: Find all transactions that need fixing
-- ============================================
-- Get transactions with NULL, PENDING, or invalid permit numbers
INSERT INTO `temp_permit_fix` (`transaction_group_id`, `transaction_type`, `row_num`)
SELECT 
  transaction_group_id,
  transaction_type,
  @row_num := @row_num + 1 as row_num
FROM transaction_groups,
(SELECT @row_num := 0) r
WHERE permit_number IS NULL 
OR permit_number LIKE '%-PENDING'
OR permit_number NOT REGEXP '^[AB]-[0-9]+$'
ORDER BY transaction_type, created_at ASC;

-- ============================================
-- Step 3: Generate permit numbers for Type A
-- ============================================
-- Get the highest existing permit number for Type A
SET @last_a = (
  SELECT COALESCE(MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)), 0)
  FROM transaction_groups
  WHERE transaction_type = 'A'
  AND permit_number REGEXP '^A-[0-9]+$'
);

-- Update Type A transactions
UPDATE `temp_permit_fix` t1
INNER JOIN (
  SELECT transaction_group_id, @last_a := @last_a + 1 as new_num
  FROM temp_permit_fix
  WHERE transaction_type = 'A'
  ORDER BY row_num
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.new_permit_number = CONCAT('A-', t2.new_num);

-- ============================================
-- Step 4: Generate permit numbers for Type B
-- ============================================
-- Get the highest existing permit number for Type B
SET @last_b = (
  SELECT COALESCE(MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)), 0)
  FROM transaction_groups
  WHERE transaction_type = 'B'
  AND permit_number REGEXP '^B-[0-9]+$'
);

-- Update Type B transactions
UPDATE `temp_permit_fix` t1
INNER JOIN (
  SELECT transaction_group_id, @last_b := @last_b + 1 as new_num
  FROM temp_permit_fix
  WHERE transaction_type = 'B'
  ORDER BY row_num
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.new_permit_number = CONCAT('B-', t2.new_num);

-- ============================================
-- Step 5: Apply the fixes to transaction_groups
-- ============================================
UPDATE `transaction_groups` t1
INNER JOIN `temp_permit_fix` t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = t2.new_permit_number;

-- ============================================
-- Step 6: Clean up
-- ============================================
DROP TEMPORARY TABLE IF EXISTS `temp_permit_fix`;

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- VERIFICATION
-- ============================================
-- Check results:
SELECT transaction_type, permit_number, COUNT(*) as count
FROM transaction_groups
GROUP BY transaction_type, permit_number
ORDER BY transaction_type, CAST(SUBSTRING(permit_number, 3) AS UNSIGNED);

-- ============================================

