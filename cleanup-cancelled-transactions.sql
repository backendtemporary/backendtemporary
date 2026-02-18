-- SQL script to remove return logs with "Cancelled transaction" notes
-- This cleans up logs created when cancelling transactions
-- Run this script to remove all existing cancellation return logs

-- First, show what will be deleted (preview)
SELECT 
    log_id,
    type,
    roll_id,
    fabric_name,
    color_name,
    amount_meters,
    notes,
    timestamp,
    customer_name
FROM logs
WHERE type = 'return' 
  AND notes IS NOT NULL
  AND (notes LIKE '%Cancelled transaction%' 
       OR notes LIKE '%cancelled transaction%'
       OR notes LIKE '%Cancelled%'
       OR notes LIKE '%cancelled%');

-- Delete the cancellation return logs
DELETE FROM logs
WHERE type = 'return' 
  AND notes IS NOT NULL
  AND (notes LIKE '%Cancelled transaction%' 
       OR notes LIKE '%cancelled transaction%'
       OR notes LIKE '%Cancelled%'
       OR notes LIKE '%cancelled%');

-- Verify deletion (should return 0 rows)
SELECT COUNT(*) as remaining_cancelled_logs
FROM logs
WHERE type = 'return' 
  AND notes IS NOT NULL
  AND (notes LIKE '%Cancelled transaction%' 
       OR notes LIKE '%cancelled transaction%'
       OR notes LIKE '%Cancelled%'
       OR notes LIKE '%cancelled%');

