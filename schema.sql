CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE ledger_transactions (
  seq BIGSERIAL PRIMARY KEY,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  date TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Card',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_ledger_user_seq ON ledger_transactions(user_id, seq DESC);
