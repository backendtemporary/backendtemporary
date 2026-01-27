-- One-time: round existing amount_meters and amount_yards to 2 decimals
-- Run this after add-amount-yards-to-logs.sql if you want to clean float noise in existing rows.
-- Safe update mode: WHERE uses key column log_id.

UPDATE `logs`
SET 
  `amount_meters` = ROUND(`amount_meters`, 2),
  `amount_yards` = ROUND(COALESCE(`amount_yards`, `amount_meters` * 1.0936), 2)
WHERE `log_id` > 0
  AND (`amount_meters` IS NOT NULL OR `amount_yards` IS NOT NULL);
