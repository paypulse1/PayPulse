export async function ensureMerchantRegistrationDocumentSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_registration_documents (
      id UUID PRIMARY KEY,
      challenge_id UUID NOT NULL REFERENCES merchant_registration_otps(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (challenge_id, document_type)
    );
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS id UUID;
  `)

  await pool.query(`
    UPDATE merchant_registration_documents
    SET id = gen_random_uuid()
    WHERE id IS NULL;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ALTER COLUMN id SET NOT NULL;
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'merchant_registration_documents'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE merchant_registration_documents
          ADD PRIMARY KEY (id);
      END IF;
    END $$;
  `)
}
