/*
  # Photo Upload System - Initial Schema

  Creates the complete database schema for the photo upload portal.

  Tables:
    - folders: Organize upload links by event/project
    - upload_tokens: Shareable upload links with configuration
    - pending_uploads: Track photo submissions and approval status

  Storage:
    - photo-uploads bucket with RLS policies
*/

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('photo-uploads', 'photo-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TABLES
-- ============================================

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text DEFAULT '📁',
  color text DEFAULT '#3B82F6',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  settings jsonb DEFAULT '{"auto_approve": false, "notify_email": null}'::jsonb
);

-- Upload tokens table
CREATE TABLE IF NOT EXISTS upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  max_uploads integer NOT NULL DEFAULT 100,
  upload_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz, -- NULL means never expires
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  overlay_config jsonb DEFAULT '{"enabled": false, "url": "", "position": "bottom-right", "opacity": 0.8, "scale": 0.3}'::jsonb,
  success_config jsonb DEFAULT '{"show_photo": true, "title": "Upload Successful!", "message": "Your photo has been uploaded and is awaiting approval.", "button_text": "📸 DO IT AGAIN!", "enable_redirect": false, "redirect_url": "", "redirect_delay": 3000}'::jsonb
);

-- Pending uploads table
CREATE TABLE IF NOT EXISTS pending_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES upload_tokens(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  uploaded_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  metadata jsonb
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_uploads ENABLE ROW LEVEL SECURITY;

-- Folders policies
CREATE POLICY "Authenticated users can view all folders"
  ON folders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create folders"
  ON folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update their own folders"
  ON folders FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can delete their own folders"
  ON folders FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Upload tokens policies (authenticated)
CREATE POLICY "Authenticated users can view all tokens"
  ON upload_tokens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create tokens"
  ON upload_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update tokens"
  ON upload_tokens FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete their own tokens"
  ON upload_tokens FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Upload tokens policies (anonymous - for public upload flow)
CREATE POLICY "Anonymous users can read active tokens"
  ON upload_tokens FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "Anonymous users can increment upload count"
  ON upload_tokens FOR UPDATE TO anon
  USING (is_active = true) WITH CHECK (true);

-- Pending uploads policies (authenticated)
CREATE POLICY "Authenticated users can view all uploads"
  ON pending_uploads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update uploads"
  ON pending_uploads FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete uploads"
  ON pending_uploads FOR DELETE TO authenticated USING (true);

-- Pending uploads policies (anonymous - for public upload flow)
CREATE POLICY "Anonymous users can create uploads"
  ON pending_uploads FOR INSERT TO anon WITH CHECK (true);

-- ============================================
-- STORAGE POLICIES
-- ============================================

CREATE POLICY "Public can upload via signed URLs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photo-uploads');

CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photo-uploads');

CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photo-uploads');

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status);
CREATE INDEX IF NOT EXISTS idx_folders_created_by ON folders(created_by);

CREATE INDEX IF NOT EXISTS idx_upload_tokens_active ON upload_tokens(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_upload_tokens_folder ON upload_tokens(folder_id);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_created_by ON upload_tokens(created_by);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_status ON pending_uploads(status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_pending_uploads_token ON pending_uploads(token_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE folders IS 'Folders for organizing upload links by event/project';
COMMENT ON TABLE upload_tokens IS 'Shareable upload links with expiration and configuration';
COMMENT ON TABLE pending_uploads IS 'Photo submissions awaiting approval';

COMMENT ON COLUMN upload_tokens.overlay_config IS 'Watermark/overlay settings (enabled, url, position, opacity, scale)';
COMMENT ON COLUMN upload_tokens.success_config IS 'Success screen customization (title, message, button, redirect)';
COMMENT ON COLUMN folders.settings IS 'Folder settings (auto_approve, notify_email)';
