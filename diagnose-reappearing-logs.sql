-- ============================================
-- DIAGNOSE REAPPEARING LOGS
-- ============================================
-- This script helps identify why logs you deleted are still showing
-- ============================================

-- Step 1: Show all logs with their transaction groups
-- This helps you see which logs are linked to which transaction groups
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.amount_meters,
  l.timestamp,
  l.epoch,
  l.created_at,
  tg.permit_number,
  tg.transaction_type
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
ORDER BY l.epoch DESC, l.created_at DESC
LIMIT 100;

-- Step 2: Count logs per transaction group
-- If a transaction group shows more logs than expected, those are the "reappearing" ones
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  COUNT(l.log_id) as log_count,
  GROUP_CONCAT(l.log_id ORDER BY l.log_id) as all_log_ids
FROM transaction_groups tg
LEFT JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
GROUP BY tg.transaction_group_id
HAVING log_count > 0
ORDER BY tg.epoch DESC
LIMIT 50;

-- Step 3: Find logs that were created recently (might be recreated after deletion)
-- Check the created_at timestamp - if it's recent but the transaction is old, it was recreated
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.timestamp,
  l.epoch,
  l.created_at,
  tg.transaction_date,
  DATEDIFF(l.created_at, tg.transaction_date) as days_difference
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND tg.transaction_date IS NOT NULL
ORDER BY l.created_at DESC;

-- Step 4: Check for logs with the same transaction_group_id and roll_id
-- These might be duplicates that should have been deleted
SELECT 
  transaction_group_id,
  roll_id,
  type,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(log_id ORDER BY log_id) as log_ids,
  GROUP_CONCAT(created_at ORDER BY created_at) as created_dates
FROM logs
WHERE transaction_group_id IS NOT NULL
  AND roll_id IS NOT NULL
GROUP BY transaction_group_id, roll_id, type
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 5: Simple check - just show all logs for a specific transaction group
-- Replace 'YOUR_TRANSACTION_GROUP_ID' with the actual ID you're seeing issues with
-- Example: 'txn_1768228131370_ytggigyrh'
/*
SELECT 
  log_id,
  type,
  roll_id,
  fabric_name,
  color_name,
  customer_name,
  amount_meters,
  timestamp,
  created_at
FROM logs
WHERE transaction_group_id = 'YOUR_TRANSACTION_GROUP_ID'
ORDER BY created_at DESC;
*/

-- ============================================
-- MANUAL CHECK: Pick a transaction group from your results
-- and run this query to see all its logs:
-- ============================================
-- SELECT * FROM logs WHERE transaction_group_id = 'txn_1768228131370_ytggigyrh' ORDER BY created_at DESC;

