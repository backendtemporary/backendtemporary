-- ============================================================
-- One-time repair: restore the (initial - sold = current) balance
-- ============================================================
-- Run this ONLY AFTER the new backend is deployed. Running it first
-- just lets the restock leak re-open the gap.
--
-- Model: current stock is the truth (it is what is physically on the
-- shelf). The initial totals are the bookkeeping figure that drifted,
-- so they get rebased to "what is here now + everything ever sold".
--
-- Yards are treated as the primary unit and meters are derived from
-- them, which also repairs rows whose yd/m pair disagreed.
-- Weight-type fabrics are excluded: they do not use length columns.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 - Look before you leap. Review the damage per color.
-- Nothing is modified by this query.
-- ------------------------------------------------------------
SELECT
  f.fabric_name,
  c.color_id,
  c.color_name,
  c.initial_length_yards                              AS init_yd_now,
  ROUND(c.length_yards + COALESCE(s.net_yards, 0), 2) AS init_yd_after,
  ROUND(c.length_yards + COALESCE(s.net_yards, 0) - COALESCE(c.initial_length_yards, 0), 2) AS yd_correction,
  c.initial_roll_count                                AS init_rolls_now,
  c.roll_count + COALESCE(s.net_rolls, 0)             AS init_rolls_after,
  c.roll_count + COALESCE(s.net_rolls, 0) - COALESCE(c.initial_roll_count, 0) AS roll_correction,
  c.length_yards                                      AS current_yd,
  COALESCE(s.net_yards, 0)                            AS sold_yd
FROM colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
LEFT JOIN (
  SELECT color_id,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END) AS net_yards,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(roll_count, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(roll_count, 0) ELSE 0 END) AS net_rolls
  FROM logs
  GROUP BY color_id
) s ON s.color_id = c.color_id
WHERE f.unit_type = 'length'
  AND ABS(c.length_yards + COALESCE(s.net_yards, 0) - COALESCE(c.initial_length_yards, 0)) > 0.02
ORDER BY ABS(c.length_yards + COALESCE(s.net_yards, 0) - COALESCE(c.initial_length_yards, 0)) DESC;


-- ------------------------------------------------------------
-- STEP 2 - Safety net. Keep a full copy of the table first.
-- ------------------------------------------------------------
CREATE TABLE colors_backup_before_balance_fix AS SELECT * FROM colors;


-- ------------------------------------------------------------
-- STEP 3 - The repair.
-- ------------------------------------------------------------
UPDATE colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
LEFT JOIN (
  SELECT color_id,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END) AS net_yards,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(roll_count, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(roll_count, 0) ELSE 0 END) AS net_rolls
  FROM logs
  GROUP BY color_id
) s ON s.color_id = c.color_id
SET
  c.initial_length_yards  = ROUND(c.length_yards + COALESCE(s.net_yards, 0), 2),
  c.initial_length_meters = ROUND((c.length_yards + COALESCE(s.net_yards, 0)) * 0.9144, 2),
  c.initial_roll_count    = c.roll_count + COALESCE(s.net_rolls, 0)
WHERE f.unit_type = 'length';


-- ------------------------------------------------------------
-- STEP 4 - Verify. Should return ZERO rows when the fix worked.
-- ------------------------------------------------------------
SELECT
  f.fabric_name,
  c.color_id,
  c.color_name,
  ROUND(c.length_yards - (COALESCE(c.initial_length_yards, 0) - COALESCE(s.net_yards, 0)), 2) AS gap_yd,
  c.roll_count - (COALESCE(c.initial_roll_count, 0) - COALESCE(s.net_rolls, 0))               AS gap_rolls
FROM colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
LEFT JOIN (
  SELECT color_id,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(amount_yards, amount_meters * 1.0936, 0) ELSE 0 END) AS net_yards,
    SUM(CASE WHEN type IN ('sell','trim') THEN COALESCE(roll_count, 0) ELSE 0 END)
      - SUM(CASE WHEN type = 'return'     THEN COALESCE(roll_count, 0) ELSE 0 END) AS net_rolls
  FROM logs
  GROUP BY color_id
) s ON s.color_id = c.color_id
WHERE f.unit_type = 'length'
  AND (ABS(c.length_yards - (COALESCE(c.initial_length_yards, 0) - COALESCE(s.net_yards, 0))) > 0.02
       OR c.roll_count <> COALESCE(c.initial_roll_count, 0) - COALESCE(s.net_rolls, 0));


-- ------------------------------------------------------------
-- ROLLBACK (only if something looks wrong afterwards)
-- ------------------------------------------------------------
-- UPDATE colors c
-- JOIN colors_backup_before_balance_fix b ON b.color_id = c.color_id
-- SET c.initial_length_yards  = b.initial_length_yards,
--     c.initial_length_meters = b.initial_length_meters,
--     c.initial_roll_count    = b.initial_roll_count;
