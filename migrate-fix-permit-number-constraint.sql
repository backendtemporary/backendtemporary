-- ============================================
-- FIX PERMIT NUMBER CONSTRAINT ISSUE
-- ============================================
-- This migration temporarily allows NULL permit_number
-- Backend will implement auto-generation, then we'll revert to NOT NULL
-- 
-- IMPORTANT: Run this migration BEFORE deploying backend fixes
-- Compatible with older MySQL versions (no IF NOT EXISTS, SAFE UPDATE aware)
-- ============================================

-- Disable safe update mode temporarily for this migration
SET SQL_SAFE_UPDATES = 0;

-- Step 1: Make permit_number nullable (temporary fix)
-- This allows transactions to be created while backend auto-generation is implemented
ALTER TABLE `transaction_groups` 
MODIFY COLUMN `permit_number` VARCHAR(20) NULL;

-- Step 2: Update any existing NULL permit_numbers (safety check)
-- This should not be needed if constraint was enforced, but safety check
-- Using WHERE clause with primary key to satisfy safe update mode
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id 
  FROM transaction_groups 
  WHERE permit_number IS NULL
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = CONCAT(t1.transaction_type, '-PENDING');

-- Step 3: Add composite index for performance (permit number generation queries)
-- NOTE: If index already exists, you'll get "Duplicate key name" error - this is safe to ignore
-- To check if index exists first, run this query manually:
-- SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaction_groups' AND INDEX_NAME = 'idx_type_permit';
-- If result is 0, then run the ALTER TABLE below. If result is > 0, skip this step.
ALTER TABLE `transaction_groups` 
ADD INDEX `idx_type_permit` (`transaction_type`, `permit_number`);

-- Re-enable safe update mode
SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- AFTER BACKEND AUTO-GENERATION IS IMPLEMENTED:
-- ============================================
-- Uncomment and run these steps after backend generates permit numbers automatically
--
-- Step 5: Revert to NOT NULL (after backend generates permit numbers)
-- SET SQL_SAFE_UPDATES = 0;
-- ALTER TABLE `transaction_groups` 
-- MODIFY COLUMN `permit_number` VARCHAR(20) NOT NULL;
-- SET SQL_SAFE_UPDATES = 1;
--
-- Step 6: Add unique constraint per transaction type
-- This ensures A-1, A-2, B-1, B-2 are unique per type
-- SET SQL_SAFE_UPDATES = 0;
-- ALTER TABLE `transaction_groups` 
-- ADD UNIQUE KEY `unique_permit_per_type` (`transaction_type`, `permit_number`);
-- SET SQL_SAFE_UPDATES = 1;
-- ============================================

