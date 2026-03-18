CREATE TABLE IF NOT EXISTS cancellation_requests (
  request_id            INT AUTO_INCREMENT PRIMARY KEY,
  transaction_group_id  INT NOT NULL,
  requested_by_user_id  INT NOT NULL,
  requested_by_username VARCHAR(100) NOT NULL,
  reason                TEXT,
  status                ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by_user_id   INT DEFAULT NULL,
  reviewed_by_username  VARCHAR(100) DEFAULT NULL,
  review_note           TEXT DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (transaction_group_id) REFERENCES transaction_groups(transaction_group_id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_user_id)  REFERENCES users(user_id) ON DELETE SET NULL,

  INDEX idx_status (status),
  INDEX idx_transaction (transaction_group_id),
  INDEX idx_requester (requested_by_user_id)
);
