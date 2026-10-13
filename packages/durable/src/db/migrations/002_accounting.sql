ALTER TABLE budget_reservations ADD COLUMN compute_estimated_ms bigint NOT NULL DEFAULT 0 CHECK (compute_estimated_ms >= 0);
ALTER TABLE run_steps ADD COLUMN claimed_at timestamptz;
-- Runtime may account usage, but cannot increase its own admission ceilings.
-- Role grants are applied by the migration runner after the schema transaction.
