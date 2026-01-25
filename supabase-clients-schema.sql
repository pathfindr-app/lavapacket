-- LAVA Roofing - Clients Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE CLIENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    total_packets INTEGER DEFAULT 0,
    total_inspections INTEGER DEFAULT 0,
    total_media INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for search and filtering
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_address ON clients(address);
CREATE INDEX IF NOT EXISTS idx_clients_tags ON clients USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_clients_last_activity ON clients(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at DESC);

-- Full text search index for AI-powered search
CREATE INDEX IF NOT EXISTS idx_clients_search ON clients USING GIN(
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(address, '') || ' ' || coalesce(notes, ''))
);

-- ============================================
-- 2. ADD CLIENT_ID TO EXISTING TABLES
-- ============================================

-- Add client_id to packets table
ALTER TABLE packets ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_packets_client ON packets(client_id);

-- Add client_id to inspections table
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_client ON inspections(client_id);

-- Add client_id to media table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'media') THEN
        ALTER TABLE media ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_media_client ON media(client_id);
    END IF;
END $$;

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (no auth)
CREATE POLICY "Allow all operations on clients" ON clients
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 4. TRIGGER TO UPDATE updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. FUNCTION TO UPDATE CLIENT COUNTS
-- ============================================

CREATE OR REPLACE FUNCTION update_client_counts(p_client_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE clients SET
        total_packets = (SELECT COUNT(*) FROM packets WHERE client_id = p_client_id),
        total_inspections = (SELECT COUNT(*) FROM inspections WHERE client_id = p_client_id),
        total_media = COALESCE(
            (SELECT COUNT(*) FROM media WHERE client_id = p_client_id),
            0
        ),
        last_activity_at = NOW()
    WHERE id = p_client_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. MIGRATION: CREATE CLIENTS FROM EXISTING DATA
-- ============================================

-- This creates clients from unique customer_name/customer_address combinations
-- and links existing packets and inspections

DO $$
DECLARE
    rec RECORD;
    new_client_id UUID;
BEGIN
    -- Create clients from packets
    FOR rec IN
        SELECT DISTINCT customer_name, customer_address
        FROM packets
        WHERE customer_name IS NOT NULL
        AND customer_name != ''
        AND NOT EXISTS (
            SELECT 1 FROM clients
            WHERE LOWER(name) = LOWER(packets.customer_name)
            AND LOWER(COALESCE(address, '')) = LOWER(COALESCE(packets.customer_address, ''))
        )
    LOOP
        INSERT INTO clients (name, address)
        VALUES (rec.customer_name, rec.customer_address)
        RETURNING id INTO new_client_id;

        -- Link packets to this client
        UPDATE packets
        SET client_id = new_client_id
        WHERE LOWER(customer_name) = LOWER(rec.customer_name)
        AND LOWER(COALESCE(customer_address, '')) = LOWER(COALESCE(rec.customer_address, ''));
    END LOOP;

    -- Create clients from inspections that don't match existing clients
    FOR rec IN
        SELECT DISTINCT customer_name, customer_address
        FROM inspections
        WHERE customer_name IS NOT NULL
        AND customer_name != ''
        AND NOT EXISTS (
            SELECT 1 FROM clients
            WHERE LOWER(name) = LOWER(inspections.customer_name)
            AND LOWER(COALESCE(address, '')) = LOWER(COALESCE(inspections.customer_address, ''))
        )
    LOOP
        INSERT INTO clients (name, address)
        VALUES (rec.customer_name, rec.customer_address)
        RETURNING id INTO new_client_id;
    END LOOP;

    -- Link inspections to existing clients
    UPDATE inspections i
    SET client_id = c.id
    FROM clients c
    WHERE LOWER(i.customer_name) = LOWER(c.name)
    AND LOWER(COALESCE(i.customer_address, '')) = LOWER(COALESCE(c.address, ''))
    AND i.client_id IS NULL;

    -- Update counts for all clients
    UPDATE clients SET
        total_packets = (SELECT COUNT(*) FROM packets WHERE packets.client_id = clients.id),
        total_inspections = (SELECT COUNT(*) FROM inspections WHERE inspections.client_id = clients.id);

    RAISE NOTICE 'Migration complete. Created % clients.', (SELECT COUNT(*) FROM clients);
END $$;

-- ============================================
-- 7. VERIFY MIGRATION
-- ============================================

-- Uncomment to check results:
-- SELECT * FROM clients ORDER BY name;
-- SELECT COUNT(*) as total_clients FROM clients;
-- SELECT COUNT(*) as linked_packets FROM packets WHERE client_id IS NOT NULL;
-- SELECT COUNT(*) as linked_inspections FROM inspections WHERE client_id IS NOT NULL;
