-- One-time: round existing amount attributes in logs to 2 decimals
-- Fixes float noise (e.g. 218.71999999999997 → 218.72).
--
-- Attributes updated:
--   amount_meters  – rounded to 2 decimals
--   amount_yards   – rounded to 2 decimals; filled from amount_meters * 1.0936 if NULL
--
-- Prerequisite: run add-amount-yards-to-logs.sql first so amount_yards exists.
-- Safe update mode: WHERE uses key column log_id.

UPDATE `logs`
SET 
  `amount_meters` = ROUND(`amount_meters`, 2),
  `amount_yards`  = ROUND(COALESCE(`amount_yards`, `amount_meters` * 1.0936), 2)
WHERE `log_id` > 0
  AND (`amount_meters` IS NOT NULL OR `amount_yards` IS NOT NULL);
