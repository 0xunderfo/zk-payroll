CREATE TABLE IF NOT EXISTS batches (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT UNIQUE NOT NULL,
  employer_address TEXT NOT NULL,
  total_amount TEXT NOT NULL,
  note_count INTEGER NOT NULL,
  root TEXT NOT NULL,
  cumulative_leaf_count INTEGER NOT NULL,
  funding_authorization_id TEXT,
  funding_tx_hash TEXT,
  register_tx_hash TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  secret TEXT NOT NULL,
  nullifier TEXT NOT NULL,
  nullifier_hash TEXT UNIQUE NOT NULL,
  commitment TEXT NOT NULL,
  leaf_index INTEGER UNIQUE NOT NULL,
  root TEXT NOT NULL,
  path_elements JSONB NOT NULL,
  path_indices JSONB NOT NULL,
  claim_token_id TEXT UNIQUE NOT NULL,
  spent BOOLEAN NOT NULL DEFAULT FALSE,
  spent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  nullifier_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  authorization_id TEXT,
  authorization_hash TEXT,
  user_ip TEXT,
  status TEXT NOT NULL,
  relayer_tx_hash TEXT,
  finalize_tx_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE claims ADD COLUMN IF NOT EXISTS user_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_leaf_index ON notes(leaf_index);
CREATE INDEX IF NOT EXISTS idx_notes_claim_token_id ON notes(claim_token_id);
CREATE INDEX IF NOT EXISTS idx_notes_spent ON notes(spent);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_nullifier_hash_unique ON claims(nullifier_hash);
