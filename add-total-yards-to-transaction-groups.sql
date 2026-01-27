-- Add total_yards field to transaction_groups table
-- Yards is the primary unit - totals should be summed in yards, not converted from meters

ALTER TABLE `transaction_groups` 
ADD COLUMN `total_yards` decimal(10,2) DEFAULT NULL COMMENT 'Total yards (primary unit, summed directly)' AFTER `total_meters`;

-- Backfill existing records: calculate total_yards from total_meters
-- Using transaction_group_id > '' to satisfy MySQL safe update mode (requires key column in WHERE)
UPDATE `transaction_groups` 
SET `total_yards` = ROUND(`total_meters` * 1.0936, 2)
WHERE `transaction_group_id` > ''
  AND `total_meters` IS NOT NULL 
  AND `total_meters` > 0;g
