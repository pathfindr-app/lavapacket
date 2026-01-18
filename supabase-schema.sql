-- LAVA Roofing Portal - Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Packets table
CREATE TABLE packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_address TEXT,
  product_type TEXT DEFAULT 'standing-seam',
  fields JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packet photos (separate for easier querying)
CREATE TABLE packet_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id UUID REFERENCES packets(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  position JSONB DEFAULT '{"x": 50, "y": 50}',
  zoom FLOAT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(packet_id, slot_id)
);

-- Inspections table
CREATE TABLE inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  inspection_date DATE,
  inspector_name TEXT,
  concerns JSONB DEFAULT '{}',
  roof JSONB DEFAULT '{}',
  findings JSONB DEFAULT '{}',
  recommendation JSONB DEFAULT '{}',
  wrapup JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inspection photos
CREATE TABLE inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App settings (for shared password)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert default password
INSERT INTO settings (key, value) VALUES ('app_password', 'lavaroofing');

-- Create indexes for better query performance
CREATE INDEX idx_packets_updated_at ON packets(updated_at DESC);
CREATE INDEX idx_inspections_updated_at ON inspections(updated_at DESC);
CREATE INDEX idx_packet_photos_packet_id ON packet_photos(packet_id);
CREATE INDEX idx_inspection_photos_inspection_id ON inspection_photos(inspection_id);

-- Enable Row Level Security (RLS) - allowing all access since this is a simple password-protected app
ALTER TABLE packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE packet_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (since we're using anon key with password protection)
CREATE POLICY "Allow anonymous access to packets" ON packets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to packet_photos" ON packet_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to inspections" ON inspections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access to inspection_photos" ON inspection_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read on settings" ON settings FOR SELECT USING (true);

-- Storage bucket setup (run after creating the 'photos' bucket in the dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true);

-- Storage policies for the photos bucket
-- Run these after creating the bucket:
-- CREATE POLICY "Allow public read" ON storage.objects FOR SELECT USING (bucket_id = 'photos');
-- CREATE POLICY "Allow anonymous upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photos');
-- CREATE POLICY "Allow anonymous update" ON storage.objects FOR UPDATE USING (bucket_id = 'photos');
-- CREATE POLICY "Allow anonymous delete" ON storage.objects FOR DELETE USING (bucket_id = 'photos');
