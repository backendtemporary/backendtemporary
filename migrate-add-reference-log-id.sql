-- Migration: Add reference_log_id to logs table
-- This allows return logs to track which transaction they are returning

ALTER TABLE `logs` 
ADD COLUMN `reference_log_id` INT NULL AFTER `transaction_group_id`,
ADD INDEX `idx_reference_log` (`reference_log_id`);

-- Add foreign key constraint for reference log (self-referencing)
ALTER TABLE `logs`
ADD CONSTRAINT `fk_logs_reference_log` 
FOREIGN KEY (`reference_log_id`) REFERENCES `logs` (`log_id`) 
ON DELETE SET NULL;

