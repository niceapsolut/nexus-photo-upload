# Photo Upload Portal

A secure, admin-controlled photo upload system built with React, TypeScript, Vite, and Supabase.

## Overview

This application allows administrators to create temporary, shareable upload links that enable users to submit photos without requiring authentication. Admins can review, approve, or reject submissions through a dedicated approval interface.

## Key Features

### For Administrators

- **Secure Authentication**: Email/password login system for admin access
- **Folder Organization**: Group upload links by event or project (weddings, conferences, etc.)
- **Upload Link Management**: Create time-limited, token-based upload links
- **Link Configuration**:
  - Custom name and folder organization
  - Maximum upload limit per link
  - Configurable expiration time (or no expiration)
  - Watermark/overlay support with customizable position, opacity, and scale
  - Custom success screen messages and redirect URLs
  - Activate/deactivate links on demand
- **Photo Approval System**: Review, approve, or reject submitted photos
- **QR Code Generation**: Generate and download QR codes for easy link sharing
- **Export to Excel**: Download upload data as spreadsheet files

### For Users

- **Simple Camera Interface**: Capture photos directly from mobile or desktop devices
- **Gallery Upload**: Choose existing photos from device gallery
- **No Registration Required**: Upload via shareable links without creating accounts
- **Image Optimization**: Automatic compression to 2048x2048 max resolution at 85% quality
- **Upload Confirmation**: Clear success/error feedback after submission

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Edge Functions**: Supabase Edge Functions for token validation
- **Icons**: Lucide React
- **Excel Export**: SheetJS (xlsx)

## Architecture

### Where Photos Are Uploaded

Photos are uploaded to **Supabase Storage** in a bucket called `photo-uploads`:

```
photo-uploads/
├── pending/
│   └── {token_id}/
│       ├── {upload_id}.jpg          # Photo with overlay (if enabled)
│       └── {upload_id}_original.jpg  # Original photo without overlay
└── overlays/
    └── overlay-{timestamp}.png       # Admin-uploaded watermark images
```

**Upload Flow:**
1. User captures/selects a photo on the capture page
2. Photo is compressed client-side (max 2048x2048, 85% quality)
3. If overlay is enabled, watermark is applied to create a "manipulated" version
4. Both versions (original + with overlay) are uploaded to Supabase Storage
5. Upload metadata is recorded in the `pending_uploads` table
6. Token upload count is incremented

### How Users Download Photos

Admins can download photos through the **Approvals** page (`/admin/approvals`):

1. **Individual Download**: Click the download button on any photo card
   - If photo has overlay: Choose between "With Overlay" or "Original" version
   - Downloads use signed URLs (temporary, secure access)

2. **View Full Size**: Click any photo to open full-size preview modal

3. **Export to Excel**: Export upload metadata (ID, link name, folder, status, timestamps, file paths) to `.xlsx` spreadsheet

**Download Security:**
- All downloads use time-limited signed URLs (1 hour expiration)
- Only authenticated admins can access photos
- Row Level Security (RLS) policies enforce access control

## Database Schema (PostgreSQL via Supabase)

### Tables

#### `folders`
Organizes upload links by event or project.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Folder name (e.g., "Johnson Wedding") |
| description | text | Optional description |
| icon | text | Emoji icon (default: '📁') |
| color | text | Hex color code |
| created_by | uuid | Reference to auth.users |
| created_at | timestamptz | Creation timestamp |
| status | text | 'active', 'archived', or 'completed' |
| settings | jsonb | Folder settings (auto_approve, notify_email) |

#### `upload_tokens`
Stores temporary upload links with expiration and usage limits.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (used as token in URLs) |
| name | text | Link name |
| folder_id | uuid | Reference to folders table |
| max_uploads | integer | Maximum allowed uploads |
| upload_count | integer | Current upload count |
| expires_at | timestamptz | Expiration date (null = never) |
| created_by | uuid | Reference to auth.users |
| is_active | boolean | Whether link is active |
| overlay_config | jsonb | Watermark settings |
| success_config | jsonb | Success screen customization |

#### `pending_uploads`
Tracks all photo submissions with approval status.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| token_id | uuid | Reference to upload_tokens |
| storage_path | text | Path in Supabase Storage |
| file_size | bigint | File size in bytes |
| mime_type | text | MIME type (image/jpeg) |
| uploaded_at | timestamptz | Upload timestamp |
| status | text | 'pending', 'approved', or 'rejected' |
| approved_at | timestamptz | Approval timestamp |
| approved_by | uuid | Admin who approved/rejected |
| metadata | jsonb | Additional data (original_path, has_overlay, etc.) |

### Storage Bucket: `photo-uploads`

Public bucket with RLS policies:
- **Upload**: Anyone can upload via signed URLs
- **View/Download**: Only authenticated users
- **Delete**: Only authenticated users

## Project Structure

```
src/
├── components/
│   └── ProtectedRoute.tsx      # Authentication guard for admin routes
├── contexts/
│   └── AuthContext.tsx          # Authentication state management
├── lib/
│   └── supabase.ts              # Supabase client configuration
├── pages/
│   ├── Admin.tsx                # Upload link management dashboard
│   ├── Approvals.tsx            # Photo approval interface
│   ├── CapturePhoto.tsx         # User-facing photo capture page
│   ├── Folders.tsx              # Folder management page
│   ├── Login.tsx                # Admin login page
│   └── UploadSuccess.tsx        # Upload confirmation page
└── utils/
    ├── imageCompression.ts      # Client-side image compression
    └── imageOverlay.ts          # Watermark/overlay application

supabase/
├── functions/
│   ├── validate-upload-token/   # Validates tokens and generates signed URLs
│   └── complete-upload/         # Records upload completion in database
└── migrations/
    └── *.sql                    # Database schema and policies
```

## Security Features

- **Row Level Security (RLS)**: All database tables protected with Supabase RLS policies
- **Token-Based Access**: Upload links use unique, time-limited tokens
- **Signed URLs**: Temporary, secure URLs for file uploads and downloads
- **Admin-Only Access**: Photo viewing, approval, and download restricted to authenticated admins
- **File Validation**: MIME type and file size validation before upload
- **Environment Variables**: Sensitive configuration stored in environment variables

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables in `.env`:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run database migrations (see Database Setup section below)

5. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production

```bash
npm run build
```

## Database Setup

Run this SQL in the Supabase SQL Editor to create all necessary tables and policies:

```sql
-- Create the photo-uploads storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('photo-uploads', 'photo-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create folders table
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

-- Create upload_tokens table
CREATE TABLE IF NOT EXISTS upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  max_uploads integer NOT NULL DEFAULT 100,
  upload_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  overlay_config jsonb,
  success_config jsonb
);

-- Create pending_uploads table
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

-- Enable Row Level Security
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for folders
CREATE POLICY "Authenticated users can view all folders"
  ON folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create folders"
  ON folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update their own folders"
  ON folders FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Authenticated users can delete their own folders"
  ON folders FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- RLS Policies for upload_tokens
CREATE POLICY "Authenticated users can view all tokens"
  ON upload_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can view active tokens"
  ON upload_tokens FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Authenticated users can create tokens"
  ON upload_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update tokens"
  ON upload_tokens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can increment upload count"
  ON upload_tokens FOR UPDATE TO anon USING (is_active = true);
CREATE POLICY "Authenticated users can delete tokens"
  ON upload_tokens FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- RLS Policies for pending_uploads
CREATE POLICY "Authenticated users can view all uploads"
  ON pending_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can create uploads"
  ON pending_uploads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated users can update uploads"
  ON pending_uploads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete uploads"
  ON pending_uploads FOR DELETE TO authenticated USING (true);

-- Storage Policies
CREATE POLICY "Public can upload via signed URLs"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photo-uploads');
CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'photo-uploads');
CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'photo-uploads');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_active ON upload_tokens(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_tokens_folder ON upload_tokens(folder_id);
CREATE INDEX IF NOT EXISTS idx_pending_uploads_status ON pending_uploads(status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_pending_uploads_token ON pending_uploads(token_id);
```

## Usage Workflow

1. **Admin Setup**:
   - Log in to the admin portal (`/admin`)
   - Create folders to organize events/projects
   - Create upload links with desired settings (expiration, max uploads, overlay)
   - Share the link URL or QR code with users

2. **User Upload**:
   - User accesses the upload link (`/capture?t={token}`)
   - Takes photo with camera or selects from gallery
   - Photo is compressed, overlay applied (if configured), and uploaded
   - User sees customizable success screen

3. **Admin Approval**:
   - Navigate to approvals page (`/admin/approvals`)
   - Filter by status (pending/approved/rejected) and folder
   - Review photos (toggle between original and overlay versions)
   - Approve or reject each submission
   - Download individual photos or export data to Excel

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

For Edge Functions (set in Supabase dashboard):
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) |

## License

Private project - All rights reserved
