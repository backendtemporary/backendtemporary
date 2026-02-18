-- Add 'sold' flag to rolls table
-- This allows sold rolls to remain in the database for transaction history
-- while hiding them from inventory

ALTER TABLE rolls ADD COLUMN sold BOOLEAN DEFAULT FALSE;

-- Add index for better performance when filtering out sold rolls
CREATE INDEX idx_rolls_sold ON rolls(sold);

-- Update existing rolls to ensure sold is explicitly set to FALSE (for old records)
UPDATE rolls SET sold = FALSE WHERE sold IS NULL;

