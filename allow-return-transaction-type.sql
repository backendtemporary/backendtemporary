-- Migration: Allow 'return' as a transaction type
-- This script is idempotent and can be safely re-run

-- Check if transaction_type column needs to be expanded
-- Current: VARCHAR(1) - only allows single character ('A', 'B')
-- Needed: VARCHAR(20) - allows 'return' and future types

DROP PROCEDURE IF EXISTS expand_transaction_type_if_needed;
DELIMITER //
CREATE PROCEDURE expand_transaction_type_if_needed()
BEGIN
  DECLARE current_type VARCHAR(100);
  
  SELECT COLUMN_TYPE INTO current_type
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transaction_groups'
    AND COLUMN_NAME = 'transaction_type';
  
  -- If column is VARCHAR(1), expand it to VARCHAR(20)
  IF current_type = 'varchar(1)' THEN
    ALTER TABLE `transaction_groups`
    MODIFY COLUMN `transaction_type` VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
  END IF;
END //
DELIMITER ;

CALL expand_transaction_type_if_needed();
DROP PROCEDURE expand_transaction_type_if_needed;
