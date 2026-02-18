-- ============================================
-- MANAGE PERMIT NUMBER COUNTERS
-- ============================================
-- Use these commands to view and change permit number counters
-- for Type A and Type B transactions
-- ============================================

-- ============================================
-- VIEW CURRENT COUNTERS
-- ============================================
-- See the current highest permit number for each type
-- This is what the auto-generation uses as the starting point

SELECT 
  transaction_type,
  MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) as current_max_number,
  CONCAT(transaction_type, '-', MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED))) as current_max_permit,
  COUNT(*) as total_transactions
FROM transaction_groups
WHERE permit_number REGEXP '^[AB]-[0-9]+$'
GROUP BY transaction_type;

-- ============================================
-- VIEW NEXT PERMIT NUMBERS THAT WILL BE GENERATED
-- ============================================
-- See what the next permit number will be for each type

SELECT 
  transaction_type,
  COALESCE(MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)), 0) + 1 as next_number,
  CONCAT(transaction_type, '-', COALESCE(MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)), 0) + 1) as next_permit_number
FROM transaction_groups
WHERE permit_number REGEXP '^[AB]-[0-9]+$'
GROUP BY transaction_type;

-- ============================================
-- RESET COUNTER BY UPDATING HIGHEST PERMIT NUMBER
-- ============================================
-- If you want to reset the counter to start from a specific number
-- Example: Make Type A start from A-100 (next will be A-101)

SET SQL_SAFE_UPDATES = 0;

-- Step 1: Find the transaction with the highest permit number for Type A
-- Step 2: Update it to set the new starting point
-- Example: Set Type A counter to start from 99 (next will be A-100)

-- For Type A - Set counter to start from 99 (next will be A-100)
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id
  FROM transaction_groups
  WHERE transaction_type = 'A'
  AND permit_number REGEXP '^A-[0-9]+$'
  ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
  LIMIT 1
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = 'A-99'
WHERE t1.transaction_type = 'A';

-- For Type B - Set counter to start from 99 (next will be B-100)
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id
  FROM transaction_groups
  WHERE transaction_type = 'B'
  AND permit_number REGEXP '^B-[0-9]+$'
  ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
  LIMIT 1
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = 'B-99'
WHERE t1.transaction_type = 'B';

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- SET COUNTER TO SPECIFIC NUMBER
-- ============================================
-- If you want to set the counter to a specific number
-- Replace 'A-XXX' and 'B-XXX' with your desired numbers

-- Example: Set Type A to start from A-500 (next will be A-501)
-- UPDATE `transaction_groups` t1
-- INNER JOIN (
--   SELECT transaction_group_id
--   FROM transaction_groups
--   WHERE transaction_type = 'A'
--   AND permit_number REGEXP '^A-[0-9]+$'
--   ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
--   LIMIT 1
-- ) t2 ON t1.transaction_group_id = t2.transaction_group_id
-- SET t1.permit_number = 'A-500'
-- WHERE t1.transaction_type = 'A';

-- Example: Set Type B to start from B-1000 (next will be B-1001)
-- UPDATE `transaction_groups` t1
-- INNER JOIN (
--   SELECT transaction_group_id
--   FROM transaction_groups
--   WHERE transaction_type = 'B'
--   AND permit_number REGEXP '^B-[0-9]+$'
--   ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
--   LIMIT 1
-- ) t2 ON t1.transaction_group_id = t2.transaction_group_id
-- SET t1.permit_number = 'B-1000'
-- WHERE t1.transaction_type = 'B';

-- ============================================
-- ALTERNATIVE: INSERT DUMMY TRANSACTION TO SET COUNTER
-- ============================================
-- If you prefer, you can insert a dummy transaction with a high permit number
-- Then delete it. The counter will use that number as the base.

-- Example: Set Type A counter to 500
-- INSERT INTO transaction_groups 
-- (transaction_group_id, permit_number, transaction_type, customer_name, transaction_date, epoch, timezone, total_items, total_meters)
-- VALUES 
-- ('dummy_A_500', 'A-500', 'A', 'Counter Reset', NOW(), UNIX_TIMESTAMP() * 1000, 'Asia/Beirut', 0, 0.00);

-- Then delete it:
-- DELETE FROM transaction_groups WHERE transaction_group_id = 'dummy_A_500';

-- ============================================
-- VERIFY COUNTERS AFTER CHANGES
-- ============================================
-- Run this to verify the counters are set correctly

SELECT 
  transaction_type,
  MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) as current_max,
  CONCAT(transaction_type, '-', MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) + 1) as next_permit
FROM transaction_groups
WHERE permit_number REGEXP '^[AB]-[0-9]+$'
GROUP BY transaction_type;

-- ============================================

