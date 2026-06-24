-- init.sql - bootstraps the application schema and a least-privilege DB user.
-- The root/superuser ("postgres") is used only for setup; the backend
-- connects as "appuser", which can only read/write within this schema.

-- gen_random_uuid() is provided by the pgcrypto extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500) DEFAULT '',
    quantity    INTEGER NOT NULL CHECK (quantity >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at fresh on every row update.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Least-privilege application user (password supplied via env at container
-- init time through Docker's POSTGRES_* / custom env substitution in
-- docker-compose; in K8s this is templated from a Secret by an init step).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'appuser') THEN
        CREATE ROLE appuser LOGIN PASSWORD 'changeme_in_production';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE cruddb TO appuser;
GRANT USAGE ON SCHEMA public TO appuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON items TO appuser;
