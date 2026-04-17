
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `audit_id` int NOT NULL AUTO_INCREMENT,
  `table_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the table that was changed',
  `record_id` int NOT NULL COMMENT 'ID of the record that was changed',
  `action` enum('INSERT','UPDATE','DELETE') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Type of action performed',
  `user_id` int DEFAULT NULL COMMENT 'User who performed the action',
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Username for quick reference',
  `field_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Field that was changed (for UPDATE actions)',
  `old_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Previous value (for UPDATE/DELETE)',
  `new_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'New value (for INSERT/UPDATE)',
  `changes` json DEFAULT NULL COMMENT 'Full JSON object of all changes (for UPDATE with multiple fields)',
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP address of the user',
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'User agent string',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Additional context or notes',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_table_record` (`table_name`,`record_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_table_action` (`table_name`,`action`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3801 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cancellation_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cancellation_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `transaction_group_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested_by_user_id` int NOT NULL,
  `requested_by_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_by_username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `reviewed_by_user_id` (`reviewed_by_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_transaction` (`transaction_group_id`),
  KEY `idx_requester` (`requested_by_user_id`),
  CONSTRAINT `cancellation_requests_ibfk_1` FOREIGN KEY (`transaction_group_id`) REFERENCES `transaction_groups` (`transaction_group_id`) ON DELETE CASCADE,
  CONSTRAINT `cancellation_requests_ibfk_2` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `cancellation_requests_ibfk_3` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_conversations` (
  `conversation_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'New Conversation',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_message_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `message_count` int DEFAULT '0',
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`conversation_id`),
  KEY `idx_last_message` (`last_message_at` DESC),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `message_id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_message_id` bigint DEFAULT NULL,
  `branch_index` int NOT NULL DEFAULT '0',
  `is_active_branch` tinyint(1) NOT NULL DEFAULT '1',
  `role` enum('user','assistant','error') COLLATE utf8mb4_unicode_ci NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_conversation` (`conversation_id`,`timestamp`),
  KEY `idx_parent` (`parent_message_id`),
  KEY `idx_branch` (`conversation_id`,`parent_message_id`,`branch_index`),
  FULLTEXT KEY `idx_search` (`text`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations` (`conversation_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_parent_message` FOREIGN KEY (`parent_message_id`) REFERENCES `chat_messages` (`message_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=474 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `color_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `color_lots` (
  `lot_id` int NOT NULL AUTO_INCREMENT,
  `color_id` int NOT NULL,
  `lot_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `length_meters` decimal(10,2) NOT NULL DEFAULT '0.00',
  `length_yards` decimal(10,2) NOT NULL DEFAULT '0.00',
  `initial_length_meters` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in meters (first non-zero length)',
  `initial_length_yards` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in yards (first non-zero length)',
  `date` date DEFAULT NULL,
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`lot_id`),
  UNIQUE KEY `unique_color_lot_number` (`color_id`,`lot_number`),
  KEY `idx_color_id` (`color_id`),
  KEY `idx_lot_number` (`lot_number`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_updated_by` (`updated_by_user_id`),
  CONSTRAINT `color_lots_ibfk_1` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_color_lots_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_color_lots_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `colors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `colors` (
  `color_id` int NOT NULL AUTO_INCREMENT,
  `fabric_id` int NOT NULL,
  `color_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `length_meters` decimal(10,2) DEFAULT '0.00',
  `length_yards` decimal(10,2) DEFAULT '0.00',
  `initial_length_meters` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in meters (first non-zero length)',
  `initial_length_yards` decimal(10,2) DEFAULT NULL COMMENT 'Initial length in yards (first non-zero length)',
  `roll_count` int DEFAULT '0' COMMENT 'Number of rolls for this color (metadata only)',
  `initial_roll_count` int DEFAULT NULL COMMENT 'Initial roll count when color was first stocked',
  `date` date DEFAULT NULL,
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lot` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `sold` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`color_id`),
  UNIQUE KEY `unique_fabric_color_date` (`fabric_id`,`color_name`,`date`),
  KEY `idx_fabric_id` (`fabric_id`),
  KEY `idx_color_name` (`color_name`),
  KEY `idx_status` (`status`),
  KEY `idx_sold` (`sold`),
  KEY `idx_date` (`date`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_updated_by` (`updated_by_user_id`),
  CONSTRAINT `colors_ibfk_1` FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_colors_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_colors_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=205 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `customer_id` int NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `uniq_customer_name` (`customer_name`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_customers_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customers_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `deletion_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `deletion_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `requested_by_user_id` int NOT NULL,
  `request_type` enum('delete_fabric','delete_color','cancel_transaction') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL COMMENT 'ID of the item to delete (fabric_id, color_id, or log_id)',
  `target_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable name of the item',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `approved_by_user_id` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `idx_status` (`status`),
  KEY `idx_request_type` (`request_type`),
  KEY `idx_requested_by` (`requested_by_user_id`),
  KEY `idx_approved_by` (`approved_by_user_id`),
  CONSTRAINT `deletion_requests_ibfk_1` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `deletion_requests_ibfk_2` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fabrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fabrics` (
  `fabric_id` int NOT NULL AUTO_INCREMENT,
  `fabric_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `main_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `design` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  `unit_type` enum('length','weight') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'length',
  PRIMARY KEY (`fabric_id`),
  UNIQUE KEY `uq_main_code_design` (`main_code`,`design`),
  KEY `idx_fabric_name` (`fabric_name`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_updated_by` (`updated_by_user_id`),
  KEY `idx_main_code` (`main_code`),
  CONSTRAINT `fk_fabrics_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fabrics_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'sell, cancel, trim, batch, etc.',
  `fabric_id` int DEFAULT NULL,
  `color_id` int DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `salesperson_id` int DEFAULT NULL,
  `conducted_by_user_id` int DEFAULT NULL,
  `fabric_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount_meters` decimal(10,2) DEFAULT NULL,
  `amount_yards` decimal(10,2) DEFAULT NULL COMMENT 'Amount in yards (stored separately from meters)',
  `amount_kilograms` decimal(12,2) DEFAULT NULL,
  `roll_count` int DEFAULT '0' COMMENT 'Number of rolls this transaction represents (0 for cut pieces)',
  `weight` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lot` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roll_nb` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `timestamp` datetime NOT NULL,
  `epoch` bigint DEFAULT NULL,
  `timezone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Beirut',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `transaction_group_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_log_id` int DEFAULT NULL,
  PRIMARY KEY (`log_id`),
  KEY `idx_type` (`type`),
  KEY `idx_fabric_id` (`fabric_id`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_epoch` (`epoch`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_logs_fabric_id` (`fabric_id`),
  KEY `idx_logs_color_id` (`color_id`),
  KEY `idx_logs_customer_id` (`customer_id`),
  KEY `idx_transaction_group_id` (`transaction_group_id`),
  KEY `idx_transaction_group` (`transaction_group_id`),
  KEY `idx_salesperson` (`salesperson_id`),
  KEY `idx_conducted_by` (`conducted_by_user_id`),
  KEY `idx_reference_log` (`reference_log_id`),
  CONSTRAINT `fk_logs_conducted_by_user` FOREIGN KEY (`conducted_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_fabric` FOREIGN KEY (`fabric_id`) REFERENCES `fabrics` (`fabric_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_reference_log` FOREIGN KEY (`reference_log_id`) REFERENCES `logs` (`log_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_salesperson` FOREIGN KEY (`salesperson_id`) REFERENCES `salespersons` (`salesperson_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_transaction_group` FOREIGN KEY (`transaction_group_id`) REFERENCES `transaction_groups` (`transaction_group_id`) ON DELETE SET NULL,
  CONSTRAINT `logs_ibfk_3` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1712 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `salespersons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `salespersons` (
  `salesperson_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`salesperson_id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_name` (`name`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`active`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_salespersons_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_salespersons_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `transaction_drafts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_drafts` (
  `draft_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `form_data` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`draft_id`),
  KEY `idx_drafts_user` (`user_id`),
  CONSTRAINT `transaction_drafts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `transaction_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_groups` (
  `transaction_group_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `permit_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_date` datetime NOT NULL,
  `epoch` bigint NOT NULL,
  `timezone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Beirut',
  `total_items` int NOT NULL DEFAULT '0',
  `total_meters` decimal(10,2) DEFAULT '0.00',
  `total_yards` decimal(10,2) DEFAULT NULL COMMENT 'Total yards (primary unit, summed directly)',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancelled_by_user_id` int DEFAULT NULL,
  `cancellation_note` text COLLATE utf8mb4_unicode_ci,
  `edited_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`transaction_group_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_date` (`epoch`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_permit_number` (`permit_number`),
  KEY `idx_transaction_type` (`transaction_type`),
  CONSTRAINT `transaction_groups_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','ceo','manager','accountant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accountant',
  `full_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

