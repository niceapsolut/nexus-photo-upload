import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Download, Trash2, Eye, FolderOpen, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface PendingUpload {
  id: string;
  token_id: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  status: string;
  approved_at: string | null;
  metadata: Record<string, unknown>;
  upload_tokens: {
    name: string;
    folder_id: string;
    folders: {
      name: string;
      icon: string;
      color: string;
    } | null;
  };
}

interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export default function Approvals() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    loadUploads();
  }, [filter, selectedFolder]);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, icon, color')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setFolders(data || []);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  };

  const loadUploads = async () => {
    try {
      const { data, error } = await supabase
        .from('pending_uploads')
        .select(`
          *,
          upload_tokens (
            name,
            folder_id,
            folders (
              name,
              icon,
              color
            )
          )
        `)
        .eq('status', filter)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setUploads(data || []);
    } catch (err) {
      console.error('Error loading uploads:', err);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from('photo-uploads')
      .createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  };

  const updateUploadStatus = async (
    uploadId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string
  ) => {
    try {
      const updateData: Record<string, unknown> = {
        status,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      };

      if (rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from('pending_uploads')
        .update(updateData)
        .eq('id', uploadId);

      if (error) throw error;
      loadUploads();
    } catch (err) {
      console.error('Error updating upload:', err);
    }
  };

  const deleteUpload = async (uploadId: string, storagePath: string) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('photo-uploads')
        .remove([storagePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('pending_uploads')
        .delete()
        .eq('id', uploadId);

      if (dbError) throw dbError;
      loadUploads();
    } catch (err) {
      console.error('Error deleting upload:', err);
    }
  };

  const downloadImage = async (path: string, filename: string) => {
    const url = await getImageUrl(path);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportToExcel = (uploadsToExport: PendingUpload[], folderName: string = 'All') => {
    // Prepare data for Excel
    const excelData = uploadsToExport.map((upload) => ({
      'Upload ID': upload.id,
      'Link Name': upload.upload_tokens?.name || 'N/A',
      'Folder': upload.upload_tokens?.folders?.name || 'No folder',
      'Status': upload.status,
      'File Size': formatFileSize(upload.file_size),
      'Uploaded At': new Date(upload.uploaded_at).toLocaleString(),
      'Approved At': upload.approved_at ? new Date(upload.approved_at).toLocaleString() : 'N/A',
      'Storage Path': upload.storage_path,
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 36 }, // Upload ID
      { wch: 25 }, // Link Name
      { wch: 20 }, // Folder
      { wch: 12 }, // Status
      { wch: 12 }, // File Size
      { wch: 20 }, // Uploaded At
      { wch: 20 }, // Approved At
      { wch: 40 }, // Storage Path
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Uploads');

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${folderName}_${filter}_uploads_${timestamp}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Photo Approvals</h1>
                <p className="text-sm text-slate-600 mt-1">Review and manage uploaded photos</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'pending'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('approved')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'approved'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => setFilter('rejected')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'rejected'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Rejected
              </button>
            </div>

            {folders.length > 0 && (
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-slate-600" />
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="all">All Folders</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.icon} {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Export Button */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => {
                const filteredUploads = selectedFolder === 'all'
                  ? uploads
                  : uploads.filter(u => u.upload_tokens.folder_id === selectedFolder);
                
                const folderName = selectedFolder === 'all' 
                  ? 'All_Folders'
                  : folders.find(f => f.id === selectedFolder)?.name.replace(/\s+/g, '_') || 'Export';
                
                exportToExcel(filteredUploads, folderName);
              }}
              disabled={uploads.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export to Excel ({selectedFolder === 'all' 
                ? uploads.length 
                : uploads.filter(u => u.upload_tokens.folder_id === selectedFolder).length} items)
            </button>
            <span className="text-sm text-slate-600">
              Exports {filter} uploads {selectedFolder !== 'all' && 'from selected folder'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading uploads...</p>
          </div>
        ) : (() => {
          const filteredUploads = selectedFolder === 'all'
            ? uploads
            : uploads.filter(u => u.upload_tokens.folder_id === selectedFolder);

          return filteredUploads.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <p className="text-slate-600">
                No {filter} uploads {selectedFolder !== 'all' && 'in this folder'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredUploads.map((upload) => (
              <UploadCard
                key={upload.id}
                upload={upload}
                onApprove={(id) => updateUploadStatus(id, 'approved')}
                onReject={(id) => updateUploadStatus(id, 'rejected', 'Rejected by admin')}
                onDelete={deleteUpload}
                onDownload={downloadImage}
                onView={async (path) => {
                  const url = await getImageUrl(path);
                  setSelectedImage(url);
                }}
                showActions={filter === 'pending'}
              />
              ))}
            </div>
          );
        })()}
      </main>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-4xl w-full">
            <img
              src={selectedImage}
              alt="Preview"
              className="w-full h-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface UploadCardProps {
  upload: PendingUpload;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string, path: string) => void;
  onDownload: (path: string, filename: string) => void;
  onView: (path: string) => void;
  showActions: boolean;
}

function UploadCard({
  upload,
  onApprove,
  onReject,
  onDelete,
  onDownload,
  onView,
  showActions,
}: UploadCardProps) {
  const [manipulatedUrl, setManipulatedUrl] = useState<string>('');
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(false);

  useEffect(() => {
    const loadImages = async () => {
      // Load manipulated version (main image)
      const { data: manipulatedData } = await supabase.storage
        .from('photo-uploads')
        .createSignedUrl(upload.storage_path, 3600);
      if (manipulatedData?.signedUrl) {
        setManipulatedUrl(manipulatedData.signedUrl);
      }

      // Check if there's an original version
      const hasOverlayFlag = upload.metadata?.has_overlay as boolean;
      setHasOverlay(hasOverlayFlag || false);

      if (hasOverlayFlag) {
        // Try to load original version (_original.jpg)
        const originalPath = upload.storage_path.replace('.jpg', '_original.jpg');
        const { data: originalData } = await supabase.storage
          .from('photo-uploads')
          .createSignedUrl(originalPath, 3600);
        if (originalData?.signedUrl) {
          setOriginalUrl(originalData.signedUrl);
        }
      }
    };
    loadImages();
  }, [upload.storage_path, upload.metadata]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const currentImageUrl = showingOriginal ? originalUrl : manipulatedUrl;

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="relative aspect-square bg-slate-100">
        {currentImageUrl ? (
          <>
            <img
              src={currentImageUrl}
              alt="Upload"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => onView(upload.storage_path)}
            />
            {/* Badge showing current version */}
            <div className="absolute top-2 left-2">
              <span className={`px-2 py-1 text-xs font-semibold rounded ${
                showingOriginal 
                  ? 'bg-blue-500 text-white' 
                  : hasOverlay 
                    ? 'bg-green-500 text-white' 
                    : 'bg-slate-500 text-white'
              }`}>
                {showingOriginal ? '📷 Original' : hasOverlay ? '✨ With Overlay' : '📷 Photo'}
              </span>
            </div>
            {/* Toggle button if both versions exist */}
            {hasOverlay && originalUrl && (
              <button
                onClick={() => setShowingOriginal(!showingOriginal)}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white text-slate-700 px-3 py-1 rounded-lg text-xs font-semibold shadow-md transition-colors"
              >
                {showingOriginal ? 'Show Overlay ✨' : 'Show Original 📷'}
              </button>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-slate-900 mb-1">
          {upload.upload_tokens?.name || 'Unknown'}
        </h3>
        <p className="text-sm text-slate-600 mb-2">
          {upload.upload_tokens?.folders ? (
            <span>
              {upload.upload_tokens.folders.icon} {upload.upload_tokens.folders.name}
            </span>
          ) : (
            'No folder'
          )}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {new Date(upload.uploaded_at).toLocaleString()} • {formatFileSize(upload.file_size)}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => onView(showingOriginal && originalUrl ? upload.storage_path.replace('.jpg', '_original.jpg') : upload.storage_path)}
            className="flex-1 flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Eye className="w-4 h-4" />
            View
          </button>
          
          {hasOverlay && originalUrl ? (
            <div className="relative group">
              <button
                className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs">▾</span>
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => onDownload(upload.storage_path, `photo-${upload.id}-overlay.jpg`)}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg"
                >
                  ✨ With Overlay
                </button>
                <button
                  onClick={() => onDownload(upload.storage_path.replace('.jpg', '_original.jpg'), `photo-${upload.id}-original.jpg`)}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-b-lg"
                >
                  📷 Original
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onDownload(upload.storage_path, `photo-${upload.id}.jpg`)}
              className="flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {showActions && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => onApprove(upload.id)}
              className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => onReject(upload.id)}
              className="flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}

        {!showActions && (
          <button
            onClick={() => onDelete(upload.id, upload.storage_path)}
            className="w-full flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors mt-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
