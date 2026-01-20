-- LAVA Portal Media System
-- Run this in Supabase SQL Editor

-- Media table for all uploads (images, videos, documents)
CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  public_url TEXT,

  -- File info
  filename TEXT,
  file_type TEXT,              -- 'image', 'video', 'document'
  mime_type TEXT,              -- 'image/webp', 'video/mp4', 'application/pdf'
  size_bytes INTEGER,

  -- Linking to other records
  linked_type TEXT,            -- 'packet', 'inspection', 'repair', 'general'
  linked_id UUID,
  slot TEXT,                   -- 'aerial', 'ssImg1', 'photo1', 'estimate', etc.

  -- Image-specific (for cropping/positioning)
  position JSONB DEFAULT '{"x": 50, "y": 50}',
  zoom FLOAT DEFAULT 1,

  -- Metadata
  caption TEXT,
  tags TEXT[],                 -- For AI search: ['roof', 'damage', 'aerial']

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by linked record
CREATE INDEX IF NOT EXISTS idx_media_linked ON media(linked_type, linked_id);

-- Index for searching by tags (for AI assistant)
CREATE INDEX IF NOT EXISTS idx_media_tags ON media USING GIN(tags);

-- Index for file type filtering
CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type);

-- Enable Row Level Security
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations (internal tool, no user auth)
CREATE POLICY "Allow all media operations" ON media
  FOR ALL USING (true) WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_media_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS media_updated_at ON media;
CREATE TRIGGER media_updated_at
  BEFORE UPDATE ON media
  FOR EACH ROW
  EXECUTE FUNCTION update_media_timestamp();

-- Create storage bucket for media (run separately if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);
