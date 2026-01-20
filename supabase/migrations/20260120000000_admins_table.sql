/*
  # Admins Table

  Creates a table to track admin users for listing and management.
*/

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view all admins"
  ON admins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert admins"
  ON admins FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete admins"
  ON admins FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
