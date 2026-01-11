-- ============================================
-- CLEANUP PERMIT NUMBER COLUMN
-- Run this first to remove permit_number if it exists
-- ============================================

-- Remove unique constraint if it exists
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

-- Remove index if it exists
SET @indexname = "idx_permit_number";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (INDEX_NAME = @indexname)
  ) > 0,
  "ALTER TABLE `transaction_groups` DROP INDEX `idx_permit_number`;",
  "SELECT 'Index does not exist';"
));
PREPARE dropIndex FROM @preparedStatement;
EXECUTE dropIndex;
DEALLOCATE PREPARE dropIndex;

-- Remove column if it exists
SET @columnname = "permit_number";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "ALTER TABLE `transaction_groups` DROP COLUMN `permit_number`;",
  "SELECT 'Column does not exist';"
));
PREPARE dropColumn FROM @preparedStatement;
EXECUTE dropColumn;
DEALLOCATE PREPARE dropColumn;

