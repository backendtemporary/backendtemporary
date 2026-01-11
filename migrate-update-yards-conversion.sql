-- Migration: Update meters to yards conversion factor from 1.09361 to 1.0936
-- This updates all existing length_yards values in the rolls table to use the new conversion factor

-- Update all rolls: recalculate length_yards from length_meters using new conversion factor (1.0936)
UPDATE `rolls`
SET `length_yards` = `length_meters` * 1.0936
WHERE `length_meters` IS NOT NULL AND `length_meters` > 0;

-- Verify the update (optional - check a few rows to ensure conversion looks correct)
-- SELECT roll_id, length_meters, length_yards, length_meters * 1.0936 as expected_yards
-- FROM rolls
-- LIMIT 10;

