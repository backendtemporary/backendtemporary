-- ============================================
-- DELETE TRANSACTION GROUPS FOR CUSTOMER: Abdallah Elrizz
-- WARNING: This will permanently delete all transaction groups for this customer
-- Note: This will also delete related logs due to foreign key constraints
-- ============================================

-- First, let's see what we're about to delete (for verification)
SELECT 
    transaction_group_id,
    permit_number,
    customer_name,
    transaction_date,
    total_items,
    total_meters,
    notes
FROM `transaction_groups`
WHERE `customer_name` = 'Abdallah Elrizz'
ORDER BY `transaction_date` DESC;

-- Count how many will be deleted
SELECT COUNT(*) as count_to_delete
FROM `transaction_groups`
WHERE `customer_name` = 'Abdallah Elrizz';

-- ============================================
-- ACTUAL DELETION (Uncomment to execute)
-- ============================================

-- Delete transaction groups for this customer
-- WARNING: This will also delete related logs due to foreign key constraints
-- DELETE FROM `transaction_groups`
-- WHERE `customer_name` = 'Abdallah Elrizz';
