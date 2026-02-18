-- ============================================
-- FIND AND DELETE DUPLICATE LOGS
-- ============================================
-- This script finds duplicate logs and helps you delete them
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- Step 1: Find exact duplicates (same transaction_group_id, roll_id, type, epoch, amount)
-- Keep the oldest log_id, delete the rest
SELECT 
  'DUPLICATES FOUND' as status,
  transaction_group_id,
  roll_id,
  type,
  epoch,
  amount_meters,
  COUNT(*) as duplicate_count,
  MIN(log_id) as keep_log_id,
  GROUP_CONCAT(log_id ORDER BY log_id) as all_log_ids
FROM logs
WHERE transaction_group_id IS NOT NULL
GROUP BY transaction_group_id, roll_id, type, epoch, amount_meters
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, epoch DESC;

-- Step 2: Delete duplicates (keeps the oldest log_id, deletes the rest)
-- UNCOMMENT THE FOLLOWING TO ACTUALLY DELETE:
/*
DELETE l1 FROM logs l1
INNER JOIN logs l2 ON 
  l1.transaction_group_id = l2.transaction_group_id
  AND l1.roll_id = l2.roll_id
  AND l1.type = l2.type
  AND l1.epoch = l2.epoch
  AND ABS(l1.amount_meters - l2.amount_meters) < 0.01
  AND l1.log_id > l2.log_id;  -- Keep the oldest (lowest log_id), delete newer duplicates
*/

-- Step 3: Find logs that should have been deleted (orphaned logs)
-- Logs with transaction_group_id pointing to non-existent transaction groups
SELECT 
  'ORPHANED LOGS' as status,
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.timestamp
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.transaction_group_id IS NOT NULL
  AND tg.transaction_group_id IS NULL;

-- Step 4: Delete orphaned logs (logs with deleted transaction groups)
-- UNCOMMENT THE FOLLOWING TO ACTUALLY DELETE:
/*
DELETE FROM logs
WHERE transaction_group_id IS NOT NULL
  AND transaction_group_id NOT IN (
    SELECT transaction_group_id FROM transaction_groups
  );
*/

-- Step 5: Check for logs with NULL transaction_group_id that might be duplicates
SELECT 
  'NULL GROUP LOGS' as status,
  log_id,
  type,
  roll_id,
  fabric_name,
  color_name,
  customer_name,
  amount_meters,
  timestamp,
  epoch
FROM logs
WHERE transaction_group_id IS NULL
  AND type IN ('sell', 'trim')
ORDER BY epoch DESC
LIMIT 50;

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- VERIFY: Count logs before and after
-- ============================================
SELECT COUNT(*) as total_logs FROM logs;
SELECT COUNT(DISTINCT transaction_group_id) as unique_transaction_groups FROM logs WHERE transaction_group_id IS NOT NULL;

