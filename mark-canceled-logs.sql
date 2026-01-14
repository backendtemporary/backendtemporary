-- ============================================
-- MARK CANCELED TRANSACTION LOGS
-- ============================================
-- This script adds a column to permanently mark canceled logs
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- Step 1: Add is_canceled column to logs table
ALTER TABLE logs 
ADD COLUMN is_canceled TINYINT(1) DEFAULT 0 COMMENT '1 if this log is from a canceled transaction, 0 otherwise';

-- Step 2: Mark existing canceled logs
UPDATE logs 
SET is_canceled = 1
WHERE notes IS NOT NULL
  AND (notes LIKE '%Cancelled%' 
       OR notes LIKE '%cancelled%'
       OR notes LIKE '%Cancel%'
       OR notes LIKE '%cancel%');

-- Step 3: Verify the marking
SELECT 
  is_canceled,
  COUNT(*) as count
FROM logs
GROUP BY is_canceled;

-- Step 4: Show canceled logs
SELECT 
  log_id,
  type,
  transaction_group_id,
  fabric_name,
  color_name,
  customer_name,
  amount_meters,
  notes,
  timestamp,
  is_canceled
FROM logs
WHERE is_canceled = 1
ORDER BY epoch DESC;

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- USAGE AFTER RUNNING THIS:
-- ============================================
-- To see only active (non-canceled) logs:
-- SELECT * FROM logs WHERE is_canceled = 0;
--
-- To see only canceled logs:
-- SELECT * FROM logs WHERE is_canceled = 1;
--
-- To see all logs with canceled indicator:
-- SELECT *, CASE WHEN is_canceled = 1 THEN 'CANCELED' ELSE 'ACTIVE' END as status FROM logs;

