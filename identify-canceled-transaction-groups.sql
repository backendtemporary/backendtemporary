-- ============================================
-- IDENTIFY CANCELED TRANSACTION GROUPS
-- ============================================
-- This script shows transaction_groups and identifies which ones have canceled logs
-- ============================================

-- Method 1: Show all transaction groups with canceled log count
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  tg.epoch,
  COUNT(l.log_id) as total_logs,
  SUM(CASE 
    WHEN l.notes IS NOT NULL 
    AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%') 
    THEN 1 
    ELSE 0 
  END) as canceled_logs_count,
  CASE 
    WHEN SUM(CASE 
      WHEN l.notes IS NOT NULL 
      AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%') 
      THEN 1 
      ELSE 0 
    END) > 0 THEN 'HAS_CANCELED'
    ELSE 'ACTIVE'
  END as status
FROM transaction_groups tg
LEFT JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
GROUP BY tg.transaction_group_id
ORDER BY tg.epoch DESC;

-- Method 2: Show only transaction groups that HAVE canceled logs
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  tg.epoch,
  COUNT(l.log_id) as total_logs,
  SUM(CASE 
    WHEN l.notes IS NOT NULL 
    AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%') 
    THEN 1 
    ELSE 0 
  END) as canceled_logs_count
FROM transaction_groups tg
LEFT JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
GROUP BY tg.transaction_group_id
HAVING canceled_logs_count > 0
ORDER BY tg.epoch DESC;

-- Method 3: Show transaction groups with details of canceled logs
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  l.log_id,
  l.type as log_type,
  l.fabric_name,
  l.color_name,
  l.amount_meters,
  l.notes,
  l.timestamp,
  'CANCELED' as log_status
FROM transaction_groups tg
INNER JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
WHERE l.notes IS NOT NULL
  AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%')
ORDER BY tg.epoch DESC, l.epoch DESC;

-- Method 4: Complete view - transaction groups with all their logs and canceled status
SELECT 
  tg.transaction_group_id,
  tg.permit_number,
  tg.transaction_type,
  tg.customer_name,
  tg.transaction_date,
  l.log_id,
  l.type as log_type,
  l.fabric_name,
  l.color_name,
  l.amount_meters,
  l.notes,
  l.timestamp,
  CASE 
    WHEN l.notes IS NOT NULL 
    AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%') 
    THEN 'CANCELED'
    ELSE 'ACTIVE'
  END as log_status
FROM transaction_groups tg
LEFT JOIN logs l ON tg.transaction_group_id = l.transaction_group_id
ORDER BY tg.epoch DESC, l.epoch DESC;

-- Method 5: Summary - count canceled vs active transaction groups
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM logs l 
      WHERE l.transaction_group_id = tg.transaction_group_id
      AND l.notes IS NOT NULL
      AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%')
    ) THEN 'Has Canceled Logs'
    ELSE 'All Active'
  END as transaction_status,
  COUNT(*) as transaction_count
FROM transaction_groups tg
GROUP BY transaction_status;

