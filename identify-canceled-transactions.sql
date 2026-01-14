-- ============================================
-- IDENTIFY CANCELED TRANSACTION LOGS
-- ============================================
-- This script helps you identify and differentiate canceled transaction logs
-- ============================================

-- Method 1: Find logs with "Cancelled" or "cancelled" in notes
-- These are the canceled transaction logs
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.amount_meters,
  l.notes,
  l.timestamp,
  l.epoch,
  l.created_at,
  tg.permit_number,
  tg.transaction_type,
  'CANCELED' as status
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.notes IS NOT NULL
  AND (l.notes LIKE '%Cancelled%' 
       OR l.notes LIKE '%cancelled%'
       OR l.notes LIKE '%Cancel%'
       OR l.notes LIKE '%cancel%')
ORDER BY l.epoch DESC;

-- Method 2: Find return logs that reference canceled transactions
-- These are return logs created when canceling a transaction
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.amount_meters,
  l.notes,
  l.reference_log_id,
  l.timestamp,
  l.epoch,
  l.created_at,
  tg.permit_number,
  tg.transaction_type,
  'RETURN_FOR_CANCEL' as status
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
WHERE l.type = 'return'
  AND l.notes IS NOT NULL
  AND (l.notes LIKE '%Cancelled%' 
       OR l.notes LIKE '%cancelled%')
ORDER BY l.epoch DESC;

-- Method 3: Find logs that have a reference_log_id pointing to a canceled log
-- These are logs that reference canceled transactions
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.amount_meters,
  l.notes,
  l.reference_log_id,
  ref_log.notes as referenced_log_notes,
  l.timestamp,
  l.epoch,
  'REFERENCES_CANCELED' as status
FROM logs l
LEFT JOIN logs ref_log ON l.reference_log_id = ref_log.log_id
WHERE l.reference_log_id IS NOT NULL
  AND ref_log.notes IS NOT NULL
  AND (ref_log.notes LIKE '%Cancelled%' 
       OR ref_log.notes LIKE '%cancelled%')
ORDER BY l.epoch DESC;

-- Method 4: Show all logs with a "is_canceled" indicator
-- This gives you a complete view with canceled status
SELECT 
  l.log_id,
  l.type,
  l.transaction_group_id,
  l.roll_id,
  l.fabric_name,
  l.color_name,
  l.customer_name,
  l.amount_meters,
  l.notes,
  l.timestamp,
  l.epoch,
  l.created_at,
  tg.permit_number,
  tg.transaction_type,
  CASE 
    WHEN l.notes IS NOT NULL AND (l.notes LIKE '%Cancelled%' OR l.notes LIKE '%cancelled%') THEN 'YES'
    WHEN l.type = 'return' AND l.reference_log_id IS NOT NULL THEN 'MAYBE'
    ELSE 'NO'
  END as is_canceled
FROM logs l
LEFT JOIN transaction_groups tg ON l.transaction_group_id = tg.transaction_group_id
ORDER BY l.epoch DESC
LIMIT 200;

-- Method 5: Count canceled vs non-canceled logs
SELECT 
  CASE 
    WHEN notes IS NOT NULL AND (notes LIKE '%Cancelled%' OR notes LIKE '%cancelled%') THEN 'Canceled'
    ELSE 'Active'
  END as log_status,
  COUNT(*) as count
FROM logs
GROUP BY log_status;

-- ============================================
-- OPTION: Add a column to mark canceled logs
-- ============================================
-- If you want to permanently mark canceled logs, you can add a column:
/*
ALTER TABLE logs 
ADD COLUMN is_canceled TINYINT(1) DEFAULT 0;

-- Mark existing canceled logs
UPDATE logs 
SET is_canceled = 1
WHERE notes IS NOT NULL
  AND (notes LIKE '%Cancelled%' OR notes LIKE '%cancelled%');

-- Then you can easily filter:
-- SELECT * FROM logs WHERE is_canceled = 0;  -- Active logs only
-- SELECT * FROM logs WHERE is_canceled = 1;  -- Canceled logs only
*/

