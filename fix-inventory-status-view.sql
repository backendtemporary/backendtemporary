-- Fix the broken v_inventory_status view
-- This view likely references the rolls table and needs to be updated

-- Step 1: Check the current view definition (optional - just to see what it was)
-- SHOW CREATE VIEW `v_inventory_status`;

-- Step 2: Drop the broken view
DROP VIEW IF EXISTS `v_inventory_status`;

-- Step 3: Recreate the view with updated column references
-- This is a common inventory status view - adjust if your view was different
CREATE VIEW `v_inventory_status` AS
SELECT 
    r.roll_id,
    r.color_id,
    r.fabric_id,
    r.date,
    r.length_meters,
    r.length_yards,
    r.is_trimmable,
    r.weight,
    r.status,
    r.sold,
    r.lot,
    r.roll_nb,
    c.color_name,
    f.fabric_name
FROM `rolls` r
LEFT JOIN `colors` c ON r.color_id = c.color_id
LEFT JOIN `fabrics` f ON r.fabric_id = f.fabric_id
WHERE (r.sold = FALSE OR r.sold IS NULL);

-- Step 4: Verify the view works
-- SELECT * FROM `v_inventory_status` LIMIT 5;

