-- ============================================
-- ADD TRANSACTION TYPE (A/B) TO TRANSACTION GROUPS
-- This migration adds transaction_type and updates permit_number format
-- ============================================

-- Step 1: Add transaction_type column
ALTER TABLE `transaction_groups` 
ADD COLUMN `transaction_type` VARCHAR(1) NULL AFTER `permit_number`;

-- Step 2: Set default type 'A' for existing records
-- Use a subquery with primary key to satisfy safe update mode
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id 
  FROM transaction_groups 
  WHERE transaction_type IS NULL
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.transaction_type = 'A';

-- Step 3: Make transaction_type NOT NULL
ALTER TABLE `transaction_groups`
MODIFY COLUMN `transaction_type` VARCHAR(1) NOT NULL;

-- Step 4: Add index for transaction_type
ALTER TABLE `transaction_groups`
ADD INDEX `idx_transaction_type` (`transaction_type`);

-- Step 5: Change permit_number from INT to VARCHAR to support "A-1", "B-1" format
-- First, remove unique constraint
SET @dbname = DATABASE();
SET @tablename = "transaction_groups";
SET @constraintname = "unique_permit_number";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (CONSTRAINT_NAME = @constraintname)
  ) > 0,
  "ALTER TABLE `transaction_groups` DROP INDEX `unique_permit_number`;",
  "SELECT 'Constraint does not exist';"
));
PREPARE dropConstraint FROM @preparedStatement;
EXECUTE dropConstraint;
DEALLOCATE PREPARE dropConstraint;

-- Step 6: Convert existing permit numbers to "A-{number}" format
-- Use a subquery with primary key to satisfy safe update mode
UPDATE `transaction_groups` t1
INNER JOIN (
  SELECT transaction_group_id 
  FROM transaction_groups 
  WHERE permit_number IS NOT NULL AND permit_number NOT LIKE '%-%'
) t2 ON t1.transaction_group_id = t2.transaction_group_id
SET t1.permit_number = CONCAT('A-', CAST(t1.permit_number AS CHAR));

-- Step 7: Change permit_number column type to VARCHAR
ALTER TABLE `transaction_groups`
MODIFY COLUMN `permit_number` VARCHAR(20) NOT NULL;

-- Step 8: Add unique constraint on (transaction_type, permit_number) combination
-- But first, we need to extract the numeric part and ensure uniqueness per type
-- For now, we'll add a unique constraint on the full permit_number
ALTER TABLE `transaction_groups`
ADD UNIQUE KEY `unique_permit_number` (`permit_number`);

