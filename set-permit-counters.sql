-- ============================================
-- SET PERMIT NUMBER COUNTERS
-- ============================================
-- Sets Type A counter to A-5994 (next will be A-5995)
-- Sets Type B counter to B-2428 (next will be B-2429)
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- Set Type A counter to 5994
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id
  FROM transaction_groups
  WHERE transaction_type = 'A'
  AND permit_number REGEXP '^A-[0-9]+$'
  ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
  LIMIT 1
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = 'A-5994'
WHERE t1.transaction_type = 'A';

-- Set Type B counter to 2428
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id
  FROM transaction_groups
  WHERE transaction_type = 'B'
  AND permit_number REGEXP '^B-[0-9]+$'
  ORDER BY CAST(SUBSTRING(permit_number, 3) AS UNSIGNED) DESC
  LIMIT 1
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = 'B-2428'
WHERE t1.transaction_type = 'B';

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- VERIFY: Check what the next permit numbers will be
-- ============================================
SELECT 
  transaction_type,
  CONCAT(transaction_type, '-', MAX(CAST(SUBSTRING(permit_number, 3) AS UNSIGNED)) + 1) as next_permit_number
FROM transaction_groups
WHERE permit_number REGEXP '^[AB]-[0-9]+$'
GROUP BY transaction_type;

-- Should show:
-- Type A: next will be A-5995
-- Type B: next will be B-2429

