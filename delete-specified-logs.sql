-- ============================================
-- DELETE SPECIFIED LOGS
-- ============================================
-- Deletes logs with:
-- 1. Customer "Abdallah Elrizz"
-- 2. Permit numbers less than 100 (A-99, B-99, A-50, etc.)
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- Step 1: PREVIEW - See what will be deleted
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.customer_name,
  l.fabric_name,
  l.color_name,
  l.amount_meters,
  l.timestamp,
  tg.permit_number,
  CAST(SUBSTRING(tg.permit_number, 3) AS UNSIGNED) as permit_number_value
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.customer_name = 'Abdallah Elrizz'
   OR (tg.permit_number IS NOT NULL 
       AND tg.permit_number REGEXP '^[AB]-[0-9]+$'
       AND CAST(SUBSTRING(tg.permit_number, 3) AS UNSIGNED) < 100)
ORDER BY l.epoch DESC;

-- Step 2: COUNT how many will be deleted
SELECT COUNT(*) as logs_to_delete
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.customer_name = 'Abdallah Elrizz'
   OR (tg.permit_number IS NOT NULL 
       AND tg.permit_number REGEXP '^[AB]-[0-9]+$'
       AND CAST(SUBSTRING(tg.permit_number, 3) AS UNSIGNED) < 100);

-- Step 3: ACTUAL DELETE - Uncomment to execute
/*
DELETE l FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.customer_name = 'Abdallah Elrizz'
   OR (tg.permit_number IS NOT NULL 
       AND tg.permit_number REGEXP '^[AB]-[0-9]+$'
       AND CAST(SUBSTRING(tg.permit_number, 3) AS UNSIGNED) < 100);
*/

-- Step 4: Verify deletion (should return 0 or fewer rows)
SELECT COUNT(*) as remaining_logs
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.customer_name = 'Abdallah Elrizz'
   OR (tg.permit_number IS NOT NULL 
       AND tg.permit_number REGEXP '^[AB]-[0-9]+$'
       AND CAST(SUBSTRING(tg.permit_number, 3) AS UNSIGNED) < 100);

SET SQL_SAFE_UPDATES = 1;

