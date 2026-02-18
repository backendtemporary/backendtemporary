-- Add amount_yards field to logs table to store yards separately from meters
-- This allows storing yards as yards and meters as meters without conversion

ALTER TABLE `logs` 
ADD COLUMN `amount_yards` decimal(10,2) DEFAULT NULL COMMENT 'Amount in yards (stored separately from meters)' AFTER `amount_meters`;

-- Update existing records to have amount_yards calculated from amount_meters
-- Using log_id > 0 to satisfy MySQL safe update mode (requires key column in WHERE)
UPDATE `logs` 
SET `amount_yards` = `amount_meters` * 1.0936 
WHERE `log_id` > 0 
  AND `amount_meters` IS NOT NULL 
  AND `amount_meters` > 0;
