-- ============================================
-- FIX EXISTING DATA ISSUES
-- ============================================
-- This script fixes existing data that was created before the fixes
-- Run this AFTER deploying the code fixes
-- Compatible with older MySQL versions (SAFE UPDATE aware)
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- ============================================
-- FIX #1: Update NULL or PENDING permit_numbers in transaction_groups
-- ============================================
-- Existing transactions may have NULL or "PENDING" permit numbers from before auto-generation
-- This generates proper permit numbers for them

-- Step 1: Update NULL permit_numbers with auto-generated values
-- Use the sequential script (fix-permit-numbers-sequential.sql) for this
-- It's safer and handles multiple NULLs correctly
-- For now, just check what needs fixing:
SELECT 
  transaction_type,
  COUNT(*) as count_to_fix
FROM transaction_groups
WHERE permit_number IS NULL 
OR permit_number LIKE '%-PENDING'
OR permit_number NOT REGEXP '^[AB]-[0-9]+$'
GROUP BY transaction_type;

-- If you see results above, run: backend/fix-permit-numbers-sequential.sql

-- ============================================
-- FIX #2: Clean up LOT and ROLL nb fields - Remove whitespace
-- ============================================
-- Existing rolls may have whitespace-only values in lot/roll_nb
-- Convert whitespace-only to NULL

UPDATE `rolls` t1
INNER JOIN (
  SELECT roll_id 
  FROM rolls 
  WHERE (lot IS NOT NULL AND TRIM(lot) = '') 
  OR (roll_nb IS NOT NULL AND TRIM(roll_nb) = '')
) t2 ON t1.roll_id = t2.roll_id
SET 
  t1.lot = CASE WHEN TRIM(t1.lot) = '' THEN NULL ELSE TRIM(t1.lot) END,
  t1.roll_nb = CASE WHEN TRIM(t1.roll_nb) = '' THEN NULL ELSE TRIM(t1.roll_nb) END;

-- ============================================
-- FIX #3: Ensure all rolls have valid roll_id (should already be valid, but verify)
-- ============================================
-- This is more of a verification - roll_id should be auto-increment primary key
-- But we can check for any issues

-- Check for any rolls with NULL roll_id (shouldn't exist, but verify)
SELECT COUNT(*) as null_roll_ids FROM rolls WHERE roll_id IS NULL;
-- If count > 0, there's a serious problem

-- ============================================
-- FIX #4: Verify date fields are valid (optional - dates should already be valid)
-- ============================================
-- Check for invalid dates
SELECT COUNT(*) as invalid_dates FROM rolls WHERE date IS NULL OR date = '0000-00-00';
-- If count > 0, update them to today's date

UPDATE `rolls` t1
INNER JOIN (
  SELECT roll_id 
  FROM rolls 
  WHERE date IS NULL OR date = '0000-00-00'
) t2 ON t1.roll_id = t2.roll_id
SET t1.date = CURDATE();

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the fixes worked:

-- Check for remaining NULL permit_numbers
SELECT COUNT(*) as null_permit_numbers FROM transaction_groups WHERE permit_number IS NULL;

-- Check for remaining PENDING permit_numbers
SELECT COUNT(*) as pending_permit_numbers FROM transaction_groups WHERE permit_number LIKE '%-PENDING';

-- Check for whitespace-only lot/roll_nb
SELECT COUNT(*) as whitespace_only_lot FROM rolls WHERE lot IS NOT NULL AND TRIM(lot) = '';
SELECT COUNT(*) as whitespace_only_roll_nb FROM rolls WHERE roll_nb IS NOT NULL AND TRIM(roll_nb) = '';

-- ============================================

