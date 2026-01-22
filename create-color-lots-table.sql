-- Create color_lots table for splitting colors into multiple lots
-- Compatible with MySQL Workbench 8.0 CE
-- This table allows each color to be split into multiple lots with individual lengths

-- Drop table if exists (for testing/recreation)
DROP TABLE IF EXISTS `color_lots`;

-- Create color_lots table
CREATE TABLE `color_lots` (
  `lot_id` int NOT NULL AUTO_INCREMENT,
  `color_id` int NOT NULL,
  `lot_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `length_meters` decimal(10,2) NOT NULL DEFAULT 0.00,
  `length_yards` decimal(10,2) NOT NULL DEFAULT 0.00,
  `date` date DEFAULT NULL,
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lot_id`),
  UNIQUE KEY `unique_color_lot_number` (`color_id`, `lot_number`),
  KEY `idx_color_id` (`color_id`),
  KEY `idx_lot_number` (`lot_number`),
  CONSTRAINT `color_lots_ibfk_1` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_lot_length_positive` CHECK (`length_meters` >= 0 AND `length_yards` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
