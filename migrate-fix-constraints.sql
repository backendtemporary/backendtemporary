-- Migration: Fix cascade delete on logs and add constraints for data integrity
-- This ensures audit logs are preserved even when related records are deleted

-- Step 1: Remove cascade delete on logs.fabric_id
-- Change from ON DELETE RESTRICT to ON DELETE SET NULL (logs should persist)
ALTER TABLE `logs` 
  DROP FOREIGN KEY `logs_ibfk_2`;

ALTER TABLE `logs`
  ADD CONSTRAINT `logs_ibfk_2` 
  FOREIGN KEY (`fabric_id`) 
  REFERENCES `fabrics` (`fabric_id`) 
  ON DELETE SET NULL;

-- Step 2: Ensure logs table can handle NULL fabric_id (for audit trail preservation)
-- The column is already NOT NULL, but we need to allow NULL for deleted fabrics
ALTER TABLE `logs` 
  MODIFY `fabric_id` int DEFAULT NULL;

-- Note: We keep ON DELETE SET NULL for roll_id, color_id, customer_id (already correct)
-- This ensures logs are never deleted when related records are removed

-- Step 3: Add constraint to prevent negative lengths
ALTER TABLE `rolls`
  ADD CONSTRAINT `chk_length_positive` 
  CHECK (`length_meters` >= 0 AND `length_yards` >= 0);

-- Step 4: Ensure status field has valid values
ALTER TABLE `rolls`
  MODIFY `status` varchar(50) DEFAULT 'available';

