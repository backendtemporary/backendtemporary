-- ============================================
-- DIAGNOSE LOG DELETION ISSUE
-- ============================================
-- This script helps identify why deleted logs are still appearing
-- ============================================

-- Step 1: Check for duplicate logs (same transaction_group_id, same roll_id, same type, same epoch)
-- These might be the "recreated" logs
SELECT 
  transaction_group_id,
  roll_id,
  type,
  epoch,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(log_id ORDER BY log_id) as log_ids
FROM logs
WHERE transaction_group_id IS NOT NULL
GROUP BY transaction_group_id, roll_id, type, epoch
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, epoch DESC;

-- Step 2: Check for logs with NULL transaction_group_id that might be duplicates
-- These are logs that weren't properly linked to transaction groups
SELECT 
  log_id,
  type,
  roll_id,
  fabric_name,
  color_name,
  customer_name,
  amount_meters,
  timestamp,
  epoch,
  transaction_group_id
FROM logs
WHERE transaction_group_id IS NULL
ORDER BY epoch DESC
LIMIT 50;

-- Step 3: Check for orphaned logs (logs pointing to non-existent transaction groups)
-- These might be logs that should have been deleted with their transaction groups
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.timestamp,
  l.epoch
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.transaction_group_id IS NOT NULL
  AND tg.transaction_group_id IS NULL
ORDER BY l.epoch DESC;

-- Step 4: Check transaction groups that have logs
-- See if there are transaction groups that should have been deleted
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  COUNT(l.log_id) as log_count
FROM transaction_groups tg
LEFT JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
GROUP BY tg.transaction_group_id
HAVING log_count > 0
ORDER BY tg.epoch DESC
LIMIT 50;

-- Step 5: Find logs that were recently created (last 24 hours)
-- These might be logs that were "recreated" after deletion
SELECT 
  log_id,
  type,
  transaction_group_id,
  roll_id,
  fabric_name,
  color_name,
  customer_name,
  amount_meters,
  timestamp,
  epoch,
  created_at
FROM logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at DESC;

-- Step 6: Check for logs with suspicious patterns
-- Logs with same data but different log_ids (potential duplicates)
SELECT 
  l1.log_id as log_id_1,
  l2.log_id as log_id_2,
  l1.type,
  l1.roll_id,
  l1.fabric_name,
  l1.color_name,
  l1.customer_name,
  l1.amount_meters,
  l1.epoch,
  l1.transaction_group_id,
  l1.created_at as created_at_1,
  l2.created_at as created_at_2
FROM logs l1
INNER JOIN logs l2 ON 
  l1.type = l2.type
  AND l1.roll_id = l2.roll_id
  AND l1.fabric_name = l2.fabric_name
  AND l1.color_name = l2.color_name
  AND l1.customer_name = l2.customer_name
  AND ABS(l1.amount_meters - l2.amount_meters) < 0.01
  AND ABS(l1.epoch - l2.epoch) < 1000  -- Within 1 second
  AND l1.log_id < l2.log_id  -- Avoid duplicate pairs
WHERE l1.transaction_group_id IS NOT NULL
ORDER BY l1.epoch DESC
LIMIT 50;

-- ============================================
-- CLEANUP SUGGESTIONS
-- ============================================

-- If you find duplicate logs, you can delete the older ones:
-- DELETE FROM logs WHERE log_id IN (list_of_duplicate_log_ids);

-- If you find orphaned logs (logs with deleted transaction groups), you can delete them:
-- DELETE FROM logs WHERE transaction_group_id IS NOT NULL 
--   AND transaction_group_id NOT IN (SELECT transaction_group_id FROM transaction_groups);

-- ============================================

