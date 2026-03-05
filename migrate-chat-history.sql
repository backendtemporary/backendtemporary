-- ============================================
-- CHAT HISTORY TABLES — MySQL 8.0
-- ============================================
-- Run: mysql -u root -p railway < backend/migrate-chat-history.sql
-- ============================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  conversation_id VARCHAR(36) PRIMARY KEY,        -- UUID from frontend session_id
  title VARCHAR(255) DEFAULT 'New Conversation',  -- Auto-generated from first message
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  message_count INT DEFAULT 0,
  INDEX idx_last_message (last_message_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'error') NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  INDEX idx_conversation (conversation_id, timestamp),
  FULLTEXT INDEX idx_search (text)                -- Powers MATCH() AGAINST() search
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
