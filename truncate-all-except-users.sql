-- ============================================
-- TRUNCATE ALL TABLES EXCEPT USERS
-- ============================================
-- This script will delete all data from all tables except the `users` table
-- WARNING: This is irreversible! Make sure you have a backup before running this.
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
--
-- Note: The view `v_inventory_status` will automatically be empty after truncating rolls/colors/fabrics

-- Step 1: Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Step 2: Truncate all tables except users
-- Order doesn't matter since foreign keys are disabled, but we'll do it logically

-- Transaction and log data
TRUNCATE TABLE `logs`;
TRUNCATE TABLE `transaction_groups`;

-- Inventory data
TRUNCATE TABLE `rolls`;
TRUNCATE TABLE `colors`;
TRUNCATE TABLE `fabrics`;

-- Reference data
TRUNCATE TABLE `customers`;
TRUNCATE TABLE `salespersons`;
TRUNCATE TABLE `deletion_requests`;

-- Step 3: Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Verification: Check row counts (should all be 0 except users)
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
SELECT 'users', COUNT(*) FROM `users`;

-- Expected result: All tables should show 0 rows except `users` which should show your user count
