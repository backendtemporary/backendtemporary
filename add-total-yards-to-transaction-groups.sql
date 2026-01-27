-- Add total_yards field to transaction_groups table (idempotent: safe if column already exists)
-- Yards is the primary unit - totals should be summed in yards, not converted from meters

-- Add column only if it doesn't exist (avoids "Duplicate column name" when re-running)
DROP PROCEDURE IF EXISTS add_total_yards_if_missing;
DELIMITER //
CREATE PROCEDURE add_total_yards_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transaction_groups'
      AND COLUMN_NAME = 'total_yards'
  ) THEN
    ALTER TABLE `transaction_groups`
    ADD COLUMN `total_yards` decimal(10,2) DEFAULT NULL COMMENT 'Total yards (primary unit, summed directly)' AFTER `total_meters`;
  END IF;
END //
DELIMITER ;
CALL add_total_yards_if_missing();
DROP PROCEDURE add_total_yards_if_missing;

-- Backfill existing records: calculate total_yards from total_meters (safe to re-run)
-- Using transaction_group_id > '' to satisfy MySQL safe update mode (requires key column in WHERE)
UPDATE `transaction_groups`
SET `total_yards` = ROUND(`total_meters` * 1.0936, 2)
WHERE `transaction_group_id` > ''
  AND `total_meters` IS NOT NULL
  AND `total_meters` > 0;
