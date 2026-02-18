-- ============================================
-- TEMPORARY REVERT: Make permit_number nullable again
-- ============================================
-- Use this ONLY if backend deployment hasn't taken effect yet
-- This allows transactions to work while we verify backend deployment
-- ============================================

SET SQL_SAFE_UPDATES = 0;

-- Temporarily allow NULL again (until backend is confirmed deployed)
ALTER TABLE `transaction_groups` 
MODIFY COLUMN `permit_number` VARCHAR(20) NULL;

SET SQL_SAFE_UPDATES = 1;

-- ============================================
-- After confirming backend is deployed and working:
-- Run this again to enforce NOT NULL:
-- 
-- SET SQL_SAFE_UPDATES = 0;
-- ALTER TABLE `transaction_groups` 
-- MODIFY COLUMN `permit_number` VARCHAR(20) NOT NULL;
-- SET SQL_SAFE_UPDATES = 1;
-- ============================================

