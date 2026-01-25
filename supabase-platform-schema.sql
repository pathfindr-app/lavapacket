-- LAVA Roofing Platform - Extended Schema
-- Phase 1: Core infrastructure for all 10 features
-- Run this in Supabase SQL Editor

-- ============================================
-- TEAM MEMBERS (for crew scheduling)
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'crew', -- 'admin', 'crew', 'sales'
  color TEXT DEFAULT '#3b82f6', -- for calendar display
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active team members
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(active);

-- ============================================
-- JOBS (links packets to scheduling/costing)
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id UUID REFERENCES packets(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT,
  status TEXT DEFAULT 'pending', -- pending, scheduled, in_progress, completed, cancelled
  scheduled_date DATE,
  scheduled_time TIME,
  estimated_days INTEGER DEFAULT 1,
  actual_start_date DATE,
  actual_end_date DATE,
  assigned_crew UUID[] DEFAULT '{}', -- team_member ids
  estimated_amount DECIMAL(12,2),
  notes TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_packet_id ON jobs(packet_id);

-- ============================================
-- VOICE MEMOS
-- ============================================
CREATE TABLE IF NOT EXISTS voice_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  audio_url TEXT,
  transcript TEXT,
  duration_seconds INTEGER,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for voice memos
CREATE INDEX IF NOT EXISTS idx_voice_memos_client_id ON voice_memos(client_id);
CREATE INDEX IF NOT EXISTS idx_voice_memos_job_id ON voice_memos(job_id);
CREATE INDEX IF NOT EXISTS idx_voice_memos_created_at ON voice_memos(created_at DESC);

-- ============================================
-- EXPENSES (for job costing)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'material', 'labor', 'equipment', 'permit', 'subcontractor', 'other'
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'each', -- 'each', 'sqft', 'hour', 'day', 'bundle'
  unit_cost DECIMAL(10,2),
  receipt_url TEXT,
  vendor TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_job_id ON expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ============================================
-- NOTIFICATIONS LOG
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  packet_id UUID REFERENCES packets(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- 'email', 'sms'
  template TEXT, -- 'packet_sent', 'inspection_complete', 'job_scheduled', 'job_starting', 'job_complete'
  recipient TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- CLIENT PORTAL ACCESS TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS client_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  purpose TEXT DEFAULT 'portal', -- 'portal', 'signature'
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for client tokens
CREATE INDEX IF NOT EXISTS idx_client_tokens_token ON client_tokens(token);
CREATE INDEX IF NOT EXISTS idx_client_tokens_client_id ON client_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tokens_expires_at ON client_tokens(expires_at);

-- ============================================
-- DIGITAL SIGNATURES
-- ============================================
CREATE TABLE IF NOT EXISTS signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id UUID REFERENCES packets(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_data TEXT, -- base64 canvas data
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for signatures
CREATE INDEX IF NOT EXISTS idx_signatures_packet_id ON signatures(packet_id);
CREATE INDEX IF NOT EXISTS idx_signatures_client_id ON signatures(client_id);

-- ============================================
-- MATERIAL PRESETS (for quick expense entry)
-- ============================================
CREATE TABLE IF NOT EXISTS material_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'material',
  unit TEXT DEFAULT 'each',
  default_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common roofing materials
INSERT INTO material_presets (name, category, unit, default_cost) VALUES
  ('Standing Seam Panel (24ga)', 'material', 'sqft', 8.50),
  ('Underlayment (synthetic)', 'material', 'sqft', 0.35),
  ('Ice & Water Shield', 'material', 'sqft', 1.25),
  ('Ridge Cap', 'material', 'lnft', 12.00),
  ('Flashing (aluminum)', 'material', 'lnft', 4.50),
  ('Fasteners (box)', 'material', 'box', 45.00),
  ('Sealant (tube)', 'material', 'tube', 8.00),
  ('Shingle Bundle (Architectural)', 'material', 'bundle', 35.00),
  ('Brava Tile', 'material', 'sqft', 12.00),
  ('Pipe Boot', 'material', 'each', 25.00),
  ('Skylight Flashing Kit', 'material', 'each', 150.00),
  ('Dumpster Rental', 'equipment', 'day', 450.00),
  ('Scaffold Rental', 'equipment', 'week', 200.00),
  ('Crane Service', 'equipment', 'day', 1200.00),
  ('Permit Fee', 'permit', 'each', 350.00)
ON CONFLICT DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Team Members: Allow all operations (internal use only)
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all team_members operations" ON team_members FOR ALL USING (true);

-- Jobs: Allow all operations
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all jobs operations" ON jobs FOR ALL USING (true);

-- Voice Memos: Allow all operations
ALTER TABLE voice_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all voice_memos operations" ON voice_memos FOR ALL USING (true);

-- Expenses: Allow all operations
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all expenses operations" ON expenses FOR ALL USING (true);

-- Notifications: Allow all operations
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all notifications operations" ON notifications FOR ALL USING (true);

-- Client Tokens: Allow all operations
ALTER TABLE client_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all client_tokens operations" ON client_tokens FOR ALL USING (true);

-- Signatures: Allow all operations
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all signatures operations" ON signatures FOR ALL USING (true);

-- Material Presets: Allow all operations
ALTER TABLE material_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all material_presets operations" ON material_presets FOR ALL USING (true);

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

-- Update timestamp trigger for team_members
CREATE OR REPLACE FUNCTION update_team_members_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_team_members_timestamp ON team_members;
CREATE TRIGGER trigger_update_team_members_timestamp
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_team_members_timestamp();

-- Update timestamp trigger for jobs
CREATE OR REPLACE FUNCTION update_jobs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_jobs_timestamp ON jobs;
CREATE TRIGGER trigger_update_jobs_timestamp
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_jobs_timestamp();

-- ============================================
-- HELPER VIEWS
-- ============================================

-- Job summary view with totals
CREATE OR REPLACE VIEW job_summary AS
SELECT
  j.*,
  c.name as client_name,
  c.phone as client_phone,
  c.email as client_email,
  COALESCE(SUM(e.amount * e.quantity), 0) as total_expenses,
  COALESCE(j.estimated_amount, 0) - COALESCE(SUM(e.amount * e.quantity), 0) as profit,
  CASE
    WHEN COALESCE(j.estimated_amount, 0) > 0
    THEN ROUND(((COALESCE(j.estimated_amount, 0) - COALESCE(SUM(e.amount * e.quantity), 0)) / j.estimated_amount * 100)::numeric, 1)
    ELSE 0
  END as profit_margin
FROM jobs j
LEFT JOIN clients c ON j.client_id = c.id
LEFT JOIN expenses e ON e.job_id = j.id
GROUP BY j.id, c.id;

-- ============================================
-- SEED DATA: Sample team members
-- ============================================
INSERT INTO team_members (name, phone, role, color) VALUES
  ('Brad Arakaki', '808-555-0101', 'admin', '#ef4444'),
  ('Mike Johnson', '808-555-0102', 'crew', '#3b82f6'),
  ('David Lee', '808-555-0103', 'crew', '#22c55e'),
  ('Chris Wong', '808-555-0104', 'crew', '#f59e0b')
ON CONFLICT DO NOTHING;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after to verify tables were created:

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('team_members', 'jobs', 'voice_memos', 'expenses', 'notifications', 'client_tokens', 'signatures', 'material_presets');

-- SELECT * FROM team_members;
-- SELECT * FROM material_presets;
