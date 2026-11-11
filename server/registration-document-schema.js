async function ensurePgcryptoExtension(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
}

export async function ensureMerchantRegistrationDocumentSchema(pool) {
  await ensurePgcryptoExtension(pool)

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
      ADD COLUMN IF NOT EXISTS challenge_id UUID;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS document_type TEXT;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS object_key TEXT;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS file_name TEXT;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS content_type TEXT;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_registration_documents'
          AND column_name = 'uploaded_at'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_registration_documents'
          AND column_name = 'completed_at'
      ) THEN
        ALTER TABLE merchant_registration_documents
          RENAME COLUMN uploaded_at TO completed_at;
      ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_registration_documents'
          AND column_name = 'uploaded_at'
      ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_registration_documents'
          AND column_name = 'completed_at'
      ) THEN
        EXECUTE 'UPDATE merchant_registration_documents
          SET completed_at = COALESCE(completed_at, uploaded_at)
          WHERE completed_at IS NULL';
      END IF;
    END $$;
  `)

  await pool.query(`
    ALTER TABLE merchant_registration_documents
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
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
    DECLARE
      existing_primary_key TEXT;
    BEGIN
      SELECT conname INTO existing_primary_key
      FROM pg_constraint
      WHERE conrelid = 'merchant_registration_documents'::regclass
        AND contype = 'p'
        AND NOT (
          array_length(conkey, 1) = 1
          AND conkey[1] = (
            SELECT attnum
            FROM pg_attribute
            WHERE attrelid = 'merchant_registration_documents'::regclass
              AND attname = 'id'
          )
        );

      IF existing_primary_key IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE merchant_registration_documents DROP CONSTRAINT %I',
          existing_primary_key
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'merchant_registration_documents'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE merchant_registration_documents
          ADD PRIMARY KEY (id);
      END IF;
    END $$;
  `)

  await pool.query(`
    DO $$
    DECLARE
      legacy_column TEXT;
    BEGIN
      FOR legacy_column IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_registration_documents'
          AND column_name IN ('email', 'kind')
          AND is_nullable = 'NO'
      LOOP
        EXECUTE format(
          'ALTER TABLE merchant_registration_documents ALTER COLUMN %I DROP NOT NULL',
          legacy_column
        );
      END LOOP;
    END $$;
  `)
}

export async function ensureMerchantKybDocumentSchema(pool) {
  await ensurePgcryptoExtension(pool)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_kyb_documents (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (merchant_email, document_type)
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_kyb_uploads (
      id UUID PRIMARY KEY,
      merchant_email TEXT NOT NULL REFERENCES merchant_accounts(email) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK (document_type IN ('business_registration', 'identity_front', 'identity_back', 'proof_of_address')),
      object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_documents
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_uploads
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_uploads
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_kyb_documents'
          AND column_name = 'completed_at'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant_kyb_documents'
          AND column_name = 'uploaded_at'
      ) THEN
        ALTER TABLE merchant_kyb_documents
          RENAME COLUMN completed_at TO uploaded_at;
      END IF;
    END $$;
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_documents
      ADD COLUMN IF NOT EXISTS id UUID;
  `)

  await pool.query(`
    UPDATE merchant_kyb_documents
    SET id = gen_random_uuid()
    WHERE id IS NULL;
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_documents
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)

  await pool.query(`
    ALTER TABLE merchant_kyb_documents
      ALTER COLUMN id SET NOT NULL;
  `)

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'merchant_kyb_documents'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE merchant_kyb_documents
          ADD PRIMARY KEY (id);
      END IF;
    END $$;
  `)
}
