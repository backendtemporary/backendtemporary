-- RisetexCo Workbench test data seed
-- Run this whole file in MySQL Workbench against a disposable local/test database.
--
-- Optional:
--   USE risetex_dev;
--
-- Test logins created by this script:
--   wb_admin / Test123!
--   wb_ceo / Test123!
--   wb_manager / Test123!
--   wb_accountant / Test123!

SET @seed_tag = CONVERT('TEST_SEED_RISETEXCO_WORKBENCH_2026_04' USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @yards_per_meter = 1.0936132983;
SET time_zone = '+00:00';

START TRANSACTION;

-- Remove only previous Workbench seed records.
DROP TEMPORARY TABLE IF EXISTS wb_seed_group_ids;
CREATE TEMPORARY TABLE wb_seed_group_ids AS
SELECT transaction_group_id
FROM transaction_groups
WHERE transaction_group_id LIKE 'WB-G-%'
   OR notes LIKE CONCAT('%', @seed_tag, '%');

DROP TEMPORARY TABLE IF EXISTS wb_seed_user_ids;
CREATE TEMPORARY TABLE wb_seed_user_ids AS
SELECT user_id
FROM users
WHERE username LIKE 'wb\_%'
   OR email LIKE '%@risetexco.test';

DELETE cr
FROM cancellation_requests cr
JOIN wb_seed_group_ids g ON g.transaction_group_id = cr.transaction_group_id;

DELETE l
FROM logs l
LEFT JOIN wb_seed_group_ids g ON g.transaction_group_id = l.transaction_group_id
WHERE g.transaction_group_id IS NOT NULL
   OR l.notes LIKE CONCAT('%', @seed_tag, '%');

DELETE tg
FROM transaction_groups tg
JOIN wb_seed_group_ids g ON g.transaction_group_id = tg.transaction_group_id;

DELETE dr
FROM deletion_requests dr
WHERE (dr.request_type = 'delete_fabric' AND dr.target_id IN (SELECT fabric_id FROM fabrics WHERE main_code LIKE 'WB-%'))
   OR (dr.request_type = 'delete_color' AND dr.target_id IN (
        SELECT c.color_id
        FROM colors c
        JOIN fabrics f ON f.fabric_id = c.fabric_id
        WHERE f.main_code LIKE 'WB-%'
      ));

DELETE cl
FROM color_lots cl
JOIN colors c ON c.color_id = cl.color_id
JOIN fabrics f ON f.fabric_id = c.fabric_id
WHERE f.main_code LIKE 'WB-%';

DELETE c
FROM colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
WHERE f.main_code LIKE 'WB-%';

DELETE FROM fabrics
WHERE main_code LIKE 'WB-%'
   OR fabric_name LIKE 'WB TEST %';

DELETE FROM customers
WHERE customer_name LIKE 'WB TEST - %';

DELETE FROM salespersons
WHERE code LIKE 'WB-%'
   OR name LIKE 'WB TEST - %';

DELETE cm
FROM chat_messages cm
JOIN chat_conversations cc ON cc.conversation_id = cm.conversation_id
JOIN wb_seed_user_ids u ON u.user_id = cc.user_id;

DELETE cc
FROM chat_conversations cc
JOIN wb_seed_user_ids u ON u.user_id = cc.user_id;

DELETE td
FROM transaction_drafts td
JOIN wb_seed_user_ids u ON u.user_id = td.user_id;

DELETE al
FROM audit_logs al
JOIN wb_seed_user_ids u ON u.user_id = al.user_id;

DELETE u
FROM users u
JOIN wb_seed_user_ids seed_u ON seed_u.user_id = u.user_id;

-- Users. Password hash is for: Test123!
INSERT INTO users (username, email, password_hash, role, full_name)
VALUES
  ('wb_admin', 'wb_admin@risetexco.test', '$2b$10$uhEbBmjZAl9vgI9unsn51OnC6ZnBGLx8wmAj.Px6lhreneJhuCMGO', 'admin', 'Workbench Test Admin'),
  ('wb_ceo', 'wb_ceo@risetexco.test', '$2b$10$uhEbBmjZAl9vgI9unsn51OnC6ZnBGLx8wmAj.Px6lhreneJhuCMGO', 'ceo', 'Workbench Test CEO'),
  ('wb_manager', 'wb_manager@risetexco.test', '$2b$10$uhEbBmjZAl9vgI9unsn51OnC6ZnBGLx8wmAj.Px6lhreneJhuCMGO', 'manager', 'Workbench Test Manager'),
  ('wb_accountant', 'wb_accountant@risetexco.test', '$2b$10$uhEbBmjZAl9vgI9unsn51OnC6ZnBGLx8wmAj.Px6lhreneJhuCMGO', 'accountant', 'Workbench Test Accountant');

SET @admin_id = (SELECT user_id FROM users WHERE username = 'wb_admin' LIMIT 1);
SET @manager_id = (SELECT user_id FROM users WHERE username = 'wb_manager' LIMIT 1);

-- Customers.
INSERT INTO customers (customer_name, phone, email, notes, created_by_user_id)
VALUES
  ('WB TEST - Mega Fabrics Wholesale', '+961 70 101001', 'mega.workbench@example.test', CONCAT(@seed_tag, '; tier=VIP'), @admin_id),
  ('WB TEST - Cedar Boutique Beirut', '+961 70 101002', 'cedar.workbench@example.test', CONCAT(@seed_tag, '; tier=VIP'), @admin_id),
  ('WB TEST - Atelier Maison Rana', '+961 70 101003', 'atelier.workbench@example.test', CONCAT(@seed_tag, '; tier=Regular'), @admin_id),
  ('WB TEST - Master Tailor Karim', '+961 70 101004', 'tailor.workbench@example.test', CONCAT(@seed_tag, '; tier=Regular'), @admin_id),
  ('WB TEST - Zahle Garment Factory', '+961 70 101005', 'factory.workbench@example.test', CONCAT(@seed_tag, '; tier=Wholesale'), @admin_id),
  ('WB TEST - Fashion Institute Beirut', '+961 70 101006', 'school.workbench@example.test', CONCAT(@seed_tag, '; tier=Institution'), @admin_id),
  ('WB TEST - Jounieh Bridal Studio', '+961 70 101007', 'jounieh.workbench@example.test', CONCAT(@seed_tag, '; tier=Regular'), @admin_id),
  ('WB TEST - Tripoli Textiles', '+961 70 101008', 'tripoli.workbench@example.test', CONCAT(@seed_tag, '; tier=Regular'), @admin_id),
  ('WB TEST - Sidon Sewing Center', '+961 70 101009', 'sidon.workbench@example.test', CONCAT(@seed_tag, '; tier=Occasional'), @admin_id),
  ('WB TEST - Designer Lina Studio', '+961 70 101010', 'designer.workbench@example.test', CONCAT(@seed_tag, '; tier=Occasional'), @admin_id),
  ('WB TEST - Levant Imports', '+961 70 101011', 'imports.workbench@example.test', CONCAT(@seed_tag, '; tier=Wholesale'), @admin_id),
  ('WB TEST - Walk-in Sample Customer', '+961 70 101012', 'sample.workbench@example.test', CONCAT(@seed_tag, '; tier=Occasional'), @admin_id);

SET @cust_mega = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Mega Fabrics Wholesale' LIMIT 1);
SET @cust_cedar = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Cedar Boutique Beirut' LIMIT 1);
SET @cust_atelier = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Atelier Maison Rana' LIMIT 1);
SET @cust_tailor = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Master Tailor Karim' LIMIT 1);
SET @cust_factory = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Zahle Garment Factory' LIMIT 1);
SET @cust_jounieh = (SELECT customer_id FROM customers WHERE customer_name = 'WB TEST - Jounieh Bridal Studio' LIMIT 1);

-- Salespersons.
INSERT INTO salespersons (name, code, email, phone, active, created_by_user_id)
VALUES
  ('WB TEST - Ahmad Hassan', 'WB-AH', 'wb-ah@risetexco.test', '+961 71 201001', 1, @admin_id),
  ('WB TEST - Layla Fares', 'WB-LF', 'wb-lf@risetexco.test', '+961 71 201002', 1, @admin_id),
  ('WB TEST - Marie Khoury', 'WB-MK', 'wb-mk@risetexco.test', '+961 71 201003', 1, @admin_id),
  ('WB TEST - Ziad Saab', 'WB-ZS', 'wb-zs@risetexco.test', '+961 71 201004', 1, @admin_id);

SET @sp_ahmad = (SELECT salesperson_id FROM salespersons WHERE code = 'WB-AH' LIMIT 1);
SET @sp_layla = (SELECT salesperson_id FROM salespersons WHERE code = 'WB-LF' LIMIT 1);
SET @sp_marie = (SELECT salesperson_id FROM salespersons WHERE code = 'WB-MK' LIMIT 1);
SET @sp_ziad = (SELECT salesperson_id FROM salespersons WHERE code = 'WB-ZS' LIMIT 1);

-- Fabrics.
INSERT INTO fabrics (fabric_name, main_code, source, design, unit_type, created_by_user_id)
VALUES
  ('WB TEST Egyptian Cotton', 'WB-EC', 'Egypt', 'plain', 'length', @admin_id),
  ('WB TEST Belgian Linen', 'WB-BL', 'Belgium', 'woven', 'length', @admin_id),
  ('WB TEST Silk Chiffon', 'WB-SC', 'China', 'chiffon', 'length', @admin_id),
  ('WB TEST Denim Heavy', 'WB-DH', 'Turkey', 'twill', 'length', @admin_id),
  ('WB TEST Merino Wool', 'WB-MW', 'Italy', 'suiting', 'length', @admin_id),
  ('WB TEST Satin Deluxe', 'WB-SD', 'Italy', 'satin', 'length', @admin_id),
  ('WB TEST Wool Yarn Bulk', 'WB-WY', 'Lebanon', 'bulk', 'weight', @admin_id);

SET @fab_cotton = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-EC' LIMIT 1);
SET @fab_linen = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-BL' LIMIT 1);
SET @fab_silk = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-SC' LIMIT 1);
SET @fab_denim = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-DH' LIMIT 1);
SET @fab_wool = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-MW' LIMIT 1);
SET @fab_satin = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-SD' LIMIT 1);
SET @fab_yarn = (SELECT fabric_id FROM fabrics WHERE main_code = 'WB-WY' LIMIT 1);

-- Colors. length_meters/length_yards are current stock after the seeded transactions.
-- initial_length_* keeps the starting stock, so you can verify inventory math.
INSERT INTO colors
  (fabric_id, color_name, length_meters, length_yards, initial_length_meters, initial_length_yards,
   roll_count, initial_roll_count, date, weight, lot, roll_nb, status, sold, created_by_user_id)
VALUES
  (@fab_cotton, 'Navy Blue', 340.00, ROUND(340.00 * @yards_per_meter, 2), 1200.00, ROUND(1200.00 * @yards_per_meter, 2), 4, 12, '2025-10-18', '180gsm', 'WB-EC-01', 'WB-ROLL-001', 'available', 0, @admin_id),
  (@fab_cotton, 'White', 520.00, ROUND(520.00 * @yards_per_meter, 2), 800.00, ROUND(800.00 * @yards_per_meter, 2), 5, 8, '2025-10-19', '160gsm', 'WB-EC-02', 'WB-ROLL-002', 'available', 0, @admin_id),
  (@fab_cotton, 'Burgundy', 700.00, ROUND(700.00 * @yards_per_meter, 2), 700.00, ROUND(700.00 * @yards_per_meter, 2), 7, 7, '2025-10-20', '180gsm', 'WB-EC-03', 'WB-ROLL-003', 'available', 0, @admin_id),
  (@fab_linen, 'Natural White', 505.00, ROUND(505.00 * @yards_per_meter, 2), 900.00, ROUND(900.00 * @yards_per_meter, 2), 5, 9, '2025-10-18', '150gsm', 'WB-BL-01', 'WB-ROLL-004', 'available', 0, @admin_id),
  (@fab_linen, 'Sage Green', 8.00, ROUND(8.00 * @yards_per_meter, 2), 300.00, ROUND(300.00 * @yards_per_meter, 2), 1, 3, '2025-10-19', '150gsm', 'WB-BL-02', 'WB-ROLL-005', 'available', 0, @admin_id),
  (@fab_linen, 'Cream', 650.00, ROUND(650.00 * @yards_per_meter, 2), 650.00, ROUND(650.00 * @yards_per_meter, 2), 6, 6, '2025-10-20', '150gsm', 'WB-BL-03', 'WB-ROLL-006', 'available', 0, @admin_id),
  (@fab_silk, 'Rose', 375.00, ROUND(375.00 * @yards_per_meter, 2), 600.00, ROUND(600.00 * @yards_per_meter, 2), 3, 6, '2025-10-18', '80gsm', 'WB-SC-01', 'WB-ROLL-007', 'available', 0, @admin_id),
  (@fab_silk, 'Black', 500.00, ROUND(500.00 * @yards_per_meter, 2), 500.00, ROUND(500.00 * @yards_per_meter, 2), 5, 5, '2025-10-19', '80gsm', 'WB-SC-02', 'WB-ROLL-008', 'available', 0, @admin_id),
  (@fab_denim, 'Indigo', 730.00, ROUND(730.00 * @yards_per_meter, 2), 1000.00, ROUND(1000.00 * @yards_per_meter, 2), 7, 10, '2025-10-18', '12oz', 'WB-DH-01', 'WB-ROLL-009', 'available', 0, @admin_id),
  (@fab_denim, 'Black', 700.00, ROUND(700.00 * @yards_per_meter, 2), 700.00, ROUND(700.00 * @yards_per_meter, 2), 7, 7, '2025-10-19', '12oz', 'WB-DH-02', 'WB-ROLL-010', 'available', 0, @admin_id),
  (@fab_wool, 'Charcoal', 365.00, ROUND(365.00 * @yards_per_meter, 2), 500.00, ROUND(500.00 * @yards_per_meter, 2), 3, 5, '2025-10-18', '240gsm', 'WB-MW-01', 'WB-ROLL-011', 'available', 0, @admin_id),
  (@fab_wool, 'Camel', 400.00, ROUND(400.00 * @yards_per_meter, 2), 400.00, ROUND(400.00 * @yards_per_meter, 2), 4, 4, '2025-10-19', '240gsm', 'WB-MW-02', 'WB-ROLL-012', 'available', 0, @admin_id),
  (@fab_satin, 'Emerald', 295.00, ROUND(295.00 * @yards_per_meter, 2), 400.00, ROUND(400.00 * @yards_per_meter, 2), 2, 4, '2025-10-18', '110gsm', 'WB-SD-01', 'WB-ROLL-013', 'available', 0, @admin_id),
  (@fab_satin, 'Ivory', 400.00, ROUND(400.00 * @yards_per_meter, 2), 400.00, ROUND(400.00 * @yards_per_meter, 2), 4, 4, '2025-10-19', '110gsm', 'WB-SD-02', 'WB-ROLL-014', 'available', 0, @admin_id),
  (@fab_yarn, 'Ivory', 0.00, 0.00, 0.00, 0.00, 25, 30, '2025-10-18', '195.00 kg', 'WB-WY-01', 'WB-ROLL-015', 'available', 0, @admin_id),
  (@fab_yarn, 'Black', 0.00, 0.00, 0.00, 0.00, 22, 22, '2025-10-19', '850.00 kg', 'WB-WY-02', 'WB-ROLL-016', 'available', 0, @admin_id);

SET @color_cotton_navy = (SELECT color_id FROM colors WHERE fabric_id = @fab_cotton AND color_name = 'Navy Blue' LIMIT 1);
SET @color_cotton_white = (SELECT color_id FROM colors WHERE fabric_id = @fab_cotton AND color_name = 'White' LIMIT 1);
SET @color_linen_white = (SELECT color_id FROM colors WHERE fabric_id = @fab_linen AND color_name = 'Natural White' LIMIT 1);
SET @color_linen_sage = (SELECT color_id FROM colors WHERE fabric_id = @fab_linen AND color_name = 'Sage Green' LIMIT 1);
SET @color_silk_rose = (SELECT color_id FROM colors WHERE fabric_id = @fab_silk AND color_name = 'Rose' LIMIT 1);
SET @color_denim_indigo = (SELECT color_id FROM colors WHERE fabric_id = @fab_denim AND color_name = 'Indigo' LIMIT 1);
SET @color_wool_charcoal = (SELECT color_id FROM colors WHERE fabric_id = @fab_wool AND color_name = 'Charcoal' LIMIT 1);
SET @color_satin_emerald = (SELECT color_id FROM colors WHERE fabric_id = @fab_satin AND color_name = 'Emerald' LIMIT 1);
SET @color_yarn_ivory = (SELECT color_id FROM colors WHERE fabric_id = @fab_yarn AND color_name = 'Ivory' LIMIT 1);

-- One current lot for each length-based test color.
INSERT INTO color_lots
  (color_id, lot_number, length_meters, length_yards, initial_length_meters, initial_length_yards, date, weight, roll_nb, created_by_user_id)
SELECT color_id, CONCAT(lot, '-A'), length_meters, length_yards, initial_length_meters, initial_length_yards, date, weight, CONCAT(roll_nb, '-A'), @admin_id
FROM colors
WHERE fabric_id IN (@fab_cotton, @fab_linen, @fab_silk, @fab_denim, @fab_wool, @fab_satin);

-- Transaction 1.
SET @dt = '2025-11-03 10:15:00';
INSERT INTO transaction_groups
  (transaction_group_id, permit_number, transaction_type, customer_id, customer_name, transaction_date, epoch, timezone, total_items, total_meters, total_yards, notes)
VALUES
  ('WB-G-0001', 'A-WB-0001', 'A', @cust_mega, 'WB TEST - Mega Fabrics Wholesale', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 255.00, ROUND(255.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; mixed sale'));
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_navy, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Mega Fabrics Wholesale', 180.00, ROUND(180.00 * @yards_per_meter, 2), NULL, 2, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; sale cotton navy'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0001'),
  ('sell', @fab_denim, @color_denim_indigo, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Denim Heavy', 'Indigo', 'WB TEST - Mega Fabrics Wholesale', 75.00, ROUND(75.00 * @yards_per_meter, 2), NULL, 1, '12oz', 'WB-DH-01', 'WB-ROLL-009', CONCAT(@seed_tag, '; sale denim indigo'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0001');

-- Transaction 2.
SET @dt = '2025-11-19 11:40:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0002', 'A-WB-0002', 'A', @cust_cedar, 'WB TEST - Cedar Boutique Beirut', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 220.00, ROUND(220.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; boutique reorder'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_navy, @cust_cedar, @sp_layla, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Cedar Boutique Beirut', 140.00, ROUND(140.00 * @yards_per_meter, 2), NULL, 1, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; sale cotton navy'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0002'),
  ('sell', @fab_linen, @color_linen_white, @cust_cedar, @sp_layla, @manager_id, 'WB TEST Belgian Linen', 'Natural White', 'WB TEST - Cedar Boutique Beirut', 80.00, ROUND(80.00 * @yards_per_meter, 2), NULL, 1, '150gsm', 'WB-BL-01', 'WB-ROLL-004', CONCAT(@seed_tag, '; sale linen white'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0002');

-- Transaction 3.
SET @dt = '2025-12-04 09:30:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0003', 'B-WB-0001', 'B', @cust_atelier, 'WB TEST - Atelier Maison Rana', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 1, 120.00, ROUND(120.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; type B sale'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_white, @cust_atelier, @sp_marie, @manager_id, 'WB TEST Egyptian Cotton', 'White', 'WB TEST - Atelier Maison Rana', 120.00, ROUND(120.00 * @yards_per_meter, 2), NULL, 1, '160gsm', 'WB-EC-02', 'WB-ROLL-002', CONCAT(@seed_tag, '; sale cotton white'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0003');

-- Transaction 4.
SET @dt = '2025-12-18 14:05:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0004', 'A-WB-0003', 'A', @cust_mega, 'WB TEST - Mega Fabrics Wholesale', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 330.00, ROUND(330.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; winter bulk order'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_navy, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Mega Fabrics Wholesale', 260.00, ROUND(260.00 * @yards_per_meter, 2), NULL, 3, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; sale cotton navy large'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0004');
SET @log_cotton_navy_return_source = LAST_INSERT_ID();
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_wool, @color_wool_charcoal, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Merino Wool', 'Charcoal', 'WB TEST - Mega Fabrics Wholesale', 70.00, ROUND(70.00 * @yards_per_meter, 2), NULL, 1, '240gsm', 'WB-MW-01', 'WB-ROLL-011', CONCAT(@seed_tag, '; sale wool charcoal'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0004');

-- Transaction 5.
SET @dt = '2026-01-08 12:20:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0005', 'A-WB-0004', 'A', @cust_factory, 'WB TEST - Zahle Garment Factory', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 150.00, ROUND(150.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; includes weight fabric'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_linen, @color_linen_white, @cust_factory, @sp_ziad, @manager_id, 'WB TEST Belgian Linen', 'Natural White', 'WB TEST - Zahle Garment Factory', 150.00, ROUND(150.00 * @yards_per_meter, 2), NULL, 2, '150gsm', 'WB-BL-01', 'WB-ROLL-004', CONCAT(@seed_tag, '; sale linen white'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0005'),
  ('sell', @fab_yarn, @color_yarn_ivory, @cust_factory, @sp_ziad, @manager_id, 'WB TEST Wool Yarn Bulk', 'Ivory', 'WB TEST - Zahle Garment Factory', 0.00, 0.00, 45.00, 2, '300.00 kg', 'WB-WY-01', 'WB-ROLL-015', CONCAT(@seed_tag, '; sale yarn by kilograms'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0005');

-- Transaction 6.
SET @dt = '2026-01-24 16:10:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0006', 'B-WB-0002', 'B', @cust_jounieh, 'WB TEST - Jounieh Bridal Studio', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 155.00, ROUND(155.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; bridal materials'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_silk, @color_silk_rose, @cust_jounieh, @sp_marie, @manager_id, 'WB TEST Silk Chiffon', 'Rose', 'WB TEST - Jounieh Bridal Studio', 95.00, ROUND(95.00 * @yards_per_meter, 2), NULL, 1, '80gsm', 'WB-SC-01', 'WB-ROLL-007', CONCAT(@seed_tag, '; sale silk rose'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0006'),
  ('sell', @fab_satin, @color_satin_emerald, @cust_jounieh, @sp_marie, @manager_id, 'WB TEST Satin Deluxe', 'Emerald', 'WB TEST - Jounieh Bridal Studio', 60.00, ROUND(60.00 * @yards_per_meter, 2), NULL, 1, '110gsm', 'WB-SD-01', 'WB-ROLL-013', CONCAT(@seed_tag, '; sale satin emerald'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0006');

-- Transaction 7: deliberate low-stock case. Sage Green should end at 8 meters.
SET @dt = '2026-02-10 13:55:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0007', 'A-WB-0005', 'A', @cust_mega, 'WB TEST - Mega Fabrics Wholesale', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 1, 292.00, ROUND(292.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; deliberate low-stock case'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_linen, @color_linen_sage, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Belgian Linen', 'Sage Green', 'WB TEST - Mega Fabrics Wholesale', 292.00, ROUND(292.00 * @yards_per_meter, 2), NULL, 2, '150gsm', 'WB-BL-02', 'WB-ROLL-005', CONCAT(@seed_tag, '; low stock sale'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0007');

-- Transaction 8.
SET @dt = '2026-02-26 10:45:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0008', 'A-WB-0006', 'A', @cust_factory, 'WB TEST - Zahle Garment Factory', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 270.00, ROUND(270.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; production order'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_white, @cust_factory, @sp_ziad, @manager_id, 'WB TEST Egyptian Cotton', 'White', 'WB TEST - Zahle Garment Factory', 160.00, ROUND(160.00 * @yards_per_meter, 2), NULL, 2, '160gsm', 'WB-EC-02', 'WB-ROLL-002', CONCAT(@seed_tag, '; sale cotton white'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0008'),
  ('sell', @fab_denim, @color_denim_indigo, @cust_factory, @sp_ziad, @manager_id, 'WB TEST Denim Heavy', 'Indigo', 'WB TEST - Zahle Garment Factory', 110.00, ROUND(110.00 * @yards_per_meter, 2), NULL, 1, '12oz', 'WB-DH-01', 'WB-ROLL-009', CONCAT(@seed_tag, '; sale denim indigo'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0008');

-- Transaction 9.
SET @dt = '2026-03-12 15:35:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0009', 'A-WB-0007', 'A', @cust_mega, 'WB TEST - Mega Fabrics Wholesale', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 220.00, ROUND(220.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; repeat wholesale'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_navy, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Mega Fabrics Wholesale', 220.00, ROUND(220.00 * @yards_per_meter, 2), NULL, 2, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; sale cotton navy'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0009'),
  ('sell', @fab_yarn, @color_yarn_ivory, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Wool Yarn Bulk', 'Ivory', 'WB TEST - Mega Fabrics Wholesale', 0.00, 0.00, 60.00, 3, '255.00 kg', 'WB-WY-01', 'WB-ROLL-015', CONCAT(@seed_tag, '; sale yarn by kilograms'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0009');

-- Transaction 10.
SET @dt = '2026-03-28 11:25:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0010', 'B-WB-0003', 'B', @cust_cedar, 'WB TEST - Cedar Boutique Beirut', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 235.00, ROUND(235.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; spring reorder'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_linen, @color_linen_white, @cust_cedar, @sp_layla, @manager_id, 'WB TEST Belgian Linen', 'Natural White', 'WB TEST - Cedar Boutique Beirut', 190.00, ROUND(190.00 * @yards_per_meter, 2), NULL, 2, '150gsm', 'WB-BL-01', 'WB-ROLL-004', CONCAT(@seed_tag, '; sale linen white return source'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0010');
SET @log_linen_return_source = LAST_INSERT_ID();
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_satin, @color_satin_emerald, @cust_cedar, @sp_layla, @manager_id, 'WB TEST Satin Deluxe', 'Emerald', 'WB TEST - Cedar Boutique Beirut', 45.00, ROUND(45.00 * @yards_per_meter, 2), NULL, 1, '110gsm', 'WB-SD-01', 'WB-ROLL-013', CONCAT(@seed_tag, '; sale satin emerald'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0010');

-- Transaction 11.
SET @dt = '2026-04-08 09:50:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0011', 'A-WB-0008', 'A', @cust_tailor, 'WB TEST - Master Tailor Karim', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 155.00, ROUND(155.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; tailor order'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_cotton, @color_cotton_navy, @cust_tailor, @sp_marie, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Master Tailor Karim', 90.00, ROUND(90.00 * @yards_per_meter, 2), NULL, 1, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; sale cotton navy'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0011'),
  ('sell', @fab_wool, @color_wool_charcoal, @cust_tailor, @sp_marie, @manager_id, 'WB TEST Merino Wool', 'Charcoal', 'WB TEST - Master Tailor Karim', 65.00, ROUND(65.00 * @yards_per_meter, 2), NULL, 1, '240gsm', 'WB-MW-01', 'WB-ROLL-011', CONCAT(@seed_tag, '; sale wool charcoal'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0011');

-- Transaction 12.
SET @dt = '2026-04-22 14:15:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0012', 'A-WB-0009', 'A', @cust_atelier, 'WB TEST - Atelier Maison Rana', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 2, 215.00, ROUND(215.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; final seeded sale'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id)
VALUES
  ('sell', @fab_silk, @color_silk_rose, @cust_atelier, @sp_layla, @manager_id, 'WB TEST Silk Chiffon', 'Rose', 'WB TEST - Atelier Maison Rana', 130.00, ROUND(130.00 * @yards_per_meter, 2), NULL, 2, '80gsm', 'WB-SC-01', 'WB-ROLL-007', CONCAT(@seed_tag, '; sale silk rose'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0012'),
  ('sell', @fab_denim, @color_denim_indigo, @cust_atelier, @sp_layla, @manager_id, 'WB TEST Denim Heavy', 'Indigo', 'WB TEST - Atelier Maison Rana', 85.00, ROUND(85.00 * @yards_per_meter, 2), NULL, 1, '12oz', 'WB-DH-01', 'WB-ROLL-009', CONCAT(@seed_tag, '; sale denim indigo'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0012');

-- Return 1.
SET @dt = '2026-04-24 10:05:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0013', 'R-WB-0001', 'return', @cust_mega, 'WB TEST - Mega Fabrics Wholesale', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 1, 30.00, ROUND(30.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; partial return'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id, reference_log_id)
VALUES
  ('return', @fab_cotton, @color_cotton_navy, @cust_mega, @sp_ahmad, @manager_id, 'WB TEST Egyptian Cotton', 'Navy Blue', 'WB TEST - Mega Fabrics Wholesale', 30.00, ROUND(30.00 * @yards_per_meter, 2), NULL, 1, '180gsm', 'WB-EC-01', 'WB-ROLL-001', CONCAT(@seed_tag, '; return cotton navy'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0013', @log_cotton_navy_return_source);

-- Return 2.
SET @dt = '2026-04-26 16:30:00';
INSERT INTO transaction_groups
VALUES ('WB-G-0014', 'R-WB-0002', 'return', @cust_cedar, 'WB TEST - Cedar Boutique Beirut', @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 1, 25.00, ROUND(25.00 * @yards_per_meter, 2), CONCAT(@seed_tag, '; partial return'), DEFAULT, DEFAULT, NULL, NULL, NULL, NULL);
INSERT INTO logs
  (type, fabric_id, color_id, customer_id, salesperson_id, conducted_by_user_id, fabric_name, color_name, customer_name, amount_meters, amount_yards, amount_kilograms, roll_count, weight, lot, roll_nb, notes, timestamp, epoch, timezone, transaction_group_id, reference_log_id)
VALUES
  ('return', @fab_linen, @color_linen_white, @cust_cedar, @sp_layla, @manager_id, 'WB TEST Belgian Linen', 'Natural White', 'WB TEST - Cedar Boutique Beirut', 25.00, ROUND(25.00 * @yards_per_meter, 2), NULL, 1, '150gsm', 'WB-BL-01', 'WB-ROLL-004', CONCAT(@seed_tag, '; return linen white'), @dt, UNIX_TIMESTAMP(@dt) * 1000, 'Asia/Beirut', 'WB-G-0014', @log_linen_return_source);

COMMIT;

-- Summary and expected accuracy checks.
SELECT 'Workbench seed complete' AS status, @seed_tag AS seed_tag;

SELECT
  (SELECT COUNT(*) FROM users WHERE username LIKE 'wb\_%') AS users,
  (SELECT COUNT(*) FROM fabrics WHERE main_code LIKE 'WB-%') AS fabrics,
  (SELECT COUNT(*) FROM colors c JOIN fabrics f ON f.fabric_id = c.fabric_id WHERE f.main_code LIKE 'WB-%') AS colors,
  (SELECT COUNT(*) FROM customers WHERE customer_name LIKE 'WB TEST - %') AS customers,
  (SELECT COUNT(*) FROM salespersons WHERE code LIKE 'WB-%') AS salespersons,
  (SELECT COUNT(*) FROM transaction_groups WHERE transaction_group_id LIKE 'WB-G-%') AS transaction_groups,
  (SELECT COUNT(*) FROM logs WHERE notes LIKE CONCAT('%', @seed_tag, '%')) AS logs;

SELECT
  f.fabric_name,
  f.unit_type,
  ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS gross_sold_meters,
  ROUND(SUM(CASE WHEN l.type = 'return' THEN COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS returned_meters,
  ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_meters, 0) WHEN l.type = 'return' THEN -COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS net_sold_meters,
  ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_kilograms, 0) ELSE 0 END), 2) AS gross_sold_kilograms
FROM logs l
JOIN fabrics f ON f.fabric_id = l.fabric_id
WHERE l.notes LIKE CONCAT('%', @seed_tag, '%')
GROUP BY f.fabric_id, f.fabric_name, f.unit_type
ORDER BY gross_sold_meters DESC, gross_sold_kilograms DESC;

SELECT
  customer_name,
  ROUND(SUM(CASE WHEN type = 'sell' THEN COALESCE(amount_meters, 0) ELSE 0 END), 2) AS gross_sold_meters,
  ROUND(SUM(CASE WHEN type = 'return' THEN COALESCE(amount_meters, 0) ELSE 0 END), 2) AS returned_meters,
  ROUND(SUM(CASE WHEN type = 'sell' THEN COALESCE(amount_kilograms, 0) ELSE 0 END), 2) AS gross_sold_kilograms
FROM logs
WHERE notes LIKE CONCAT('%', @seed_tag, '%')
GROUP BY customer_name
ORDER BY gross_sold_meters DESC, gross_sold_kilograms DESC;

SELECT
  s.name AS salesperson_name,
  ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_meters, 0) ELSE 0 END), 2) AS gross_sold_meters,
  ROUND(SUM(CASE WHEN l.type = 'sell' THEN COALESCE(l.amount_kilograms, 0) ELSE 0 END), 2) AS gross_sold_kilograms
FROM logs l
JOIN salespersons s ON s.salesperson_id = l.salesperson_id
WHERE l.notes LIKE CONCAT('%', @seed_tag, '%')
GROUP BY s.salesperson_id, s.name
ORDER BY gross_sold_meters DESC, gross_sold_kilograms DESC;

SELECT
  f.fabric_name,
  c.color_name,
  c.length_meters,
  c.length_yards,
  c.roll_count,
  c.weight
FROM colors c
JOIN fabrics f ON f.fabric_id = c.fabric_id
WHERE f.main_code LIKE 'WB-%'
ORDER BY c.length_meters ASC, c.color_id ASC;
