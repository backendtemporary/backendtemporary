-- ============================================
-- TRUNCATE ALL TABLES EXCEPT USERS (SAFE VERSION)
-- ============================================
-- This script includes additional safety checks and verification steps
-- WARNING: This will delete ALL data except user accounts!
--
-- BEFORE RUNNING:
-- 1. Make a full database backup
-- 2. Verify you're connected to the correct database
-- 3. Review the tables that will be truncated below
--
-- Tables that will be truncated:
-- - logs (transaction history)
-- - rolls (inventory rolls)
-- - colors
-- - fabrics
-- - transaction_groups
-- - customers
-- - salespersons
-- - deletion_requests
--
-- Tables that will be KEPT:
-- - users (user accounts and authentication)

-- ============================================
-- STEP 1: VERIFICATION - Check current data
-- ============================================
-- Run this first to see what will be deleted
SELECT 
    'logs' AS table_name, COUNT(*) AS row_count FROM `logs`
UNION ALL
SELECT 'rolls', COUNT(*) FROM `rolls`
UNION ALL
SELECT 'colors', COUNT(*) FROM `colors`
UNION ALL
SELECT 'fabrics', COUNT(*) FROM `fabrics`
UNION ALL
SELECT 'transaction_groups', COUNT(*) FROM `transaction_groups`
UNION ALL
SELECT 'customers', COUNT(*) FROM `customers`
UNION ALL
SELECT 'salespersons', COUNT(*) FROM `salespersons`
UNION ALL
SELECT 'deletion_requests', COUNT(*) FROM `deletion_requests`
UNION ALL
SELECT 'users (KEPT)', COUNT(*) FROM `users`;

-- ============================================
-- STEP 2: DISABLE FOREIGN KEY CHECKS
-- ============================================
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- STEP 3: TRUNCATE TABLES
-- ============================================
-- Transaction and log data
TRUNCATE TABLE `logs`;
TRUNCATE TABLE `transaction_groups`;

-- Inventory data (order: child tables first, then parent tables)
TRUNCATE TABLE `rolls`;
TRUNCATE TABLE `colors`;
TRUNCATE TABLE `fabrics`;

-- Reference data
TRUNCATE TABLE `customers`;
TRUNCATE TABLE `salespersons`;
TRUNCATE TABLE `deletion_requests`;

-- ============================================
-- STEP 4: RE-ENABLE FOREIGN KEY CHECKS
-- ============================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- STEP 5: VERIFICATION - Confirm truncation
-- ============================================
-- All should be 0 except users
SELECT 
    'logs' AS table_name, COUNT(*) AS row_count FROM `logs`
UNION ALL
SELECT 'rolls', COUNT(*) FROM `rolls`
UNION ALL
SELECT 'colors', COUNT(*) FROM `colors`
UNION ALL
SELECT 'fabrics', COUNT(*) FROM `fabrics`
UNION ALL
SELECT 'transaction_groups', COUNT(*) FROM `transaction_groups`
UNION ALL
SELECT 'customers', COUNT(*) FROM `customers`
UNION ALL
SELECT 'salespersons', COUNT(*) FROM `salespersons`
UNION ALL
SELECT 'deletion_requests', COUNT(*) FROM `deletion_requests`
UNION ALL
SELECT 'users (KEPT)', COUNT(*) FROM `users`;

-- Expected: All tables show 0 except `users` which shows your user count
-- If you see any non-zero counts (except users), something went wrong
