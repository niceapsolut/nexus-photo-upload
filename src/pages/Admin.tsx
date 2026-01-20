import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, QrCode, Upload, LogOut, Calendar, Hash, Trash2, X, Download, Edit, FolderOpen, UserPlus, Users } from 'lucide-react';
import QRCodeSVG from 'react-qr-code';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface OverlayConfig {
  enabled: boolean;
  url: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  scale: number;
}

interface SuccessConfig {
  show_photo: boolean;
  title: string;
  message: string;
  button_text: string;
  enable_redirect: boolean;
  redirect_url: string;
  redirect_delay: number;
}

interface UploadToken {
  id: string;
  name: string;
  folder_id: string;
  max_uploads: number;
  upload_count: number;
  expires_at: string | null;
  created_at: string;
  is_active: boolean;
  overlay_config?: OverlayConfig;
  success_config?: SuccessConfig;
}

interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Admin {
  id: string;
  email: string;
  created_at: string;
  auth_user_id: string | null;
}

export default function Admin() {
  const { user, signOut } = useAuth();
  const [tokens, setTokens] = useState<UploadToken[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingToken, setEditingToken] = useState<UploadToken | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedQrUrl, setSelectedQrUrl] = useState('');
  const [selectedQrName, setSelectedQrName] = useState('');
  const qrRef = useRef<HTMLDivElement>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    folder_id: '',
    max_uploads: 100,
    expires_in_days: 90,
  });
  const [noExpiration, setNoExpiration] = useState(false);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    enabled: false,
    url: '/overlay.png',
    position: 'bottom-right',
    opacity: 0.8,
    scale: 0.3,
  });
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [overlayPreview, setOverlayPreview] = useState<string | null>(null);
  const [uploadingOverlay, setUploadingOverlay] = useState(false);
  const [successConfig, setSuccessConfig] = useState<SuccessConfig>({
    show_photo: true,
    title: 'Upload Successful!',
    message: 'Your photo has been uploaded and is awaiting approval.',
    button_text: '📸 DO IT AGAIN!',
    enable_redirect: false,
    redirect_url: '',
    redirect_delay: 3000,
  });

  useEffect(() => {
    loadTokens();
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

  const loadTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('upload_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (err) {
      console.error('Error loading tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      setOverlayFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setOverlayPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadOverlayImage = async (): Promise<string | null> => {
    if (!overlayFile) return null;

    try {
      setUploadingOverlay(true);
      
      // Generate unique filename
      const fileExt = overlayFile.name.split('.').pop();
      const fileName = `overlay-${Date.now()}.${fileExt}`;
      const filePath = `overlays/${fileName}`;

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from('photo-uploads')
        .upload(filePath, overlayFile, {
          contentType: overlayFile.type,
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('photo-uploads')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('Error uploading overlay:', err);
      alert('Failed to upload overlay image');
      return null;
    } finally {
      setUploadingOverlay(false);
    }
  };

  const createToken = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let expiresAt = null;
      if (!noExpiration) {
        const date = new Date();
        date.setDate(date.getDate() + formData.expires_in_days);
        expiresAt = date.toISOString();
      }

      // Upload overlay image if provided
      let finalOverlayConfig = { ...overlayConfig };
      if (overlayConfig.enabled && overlayFile) {
        const overlayUrl = await uploadOverlayImage();
        if (overlayUrl) {
          finalOverlayConfig.url = overlayUrl;
        } else {
          alert('Failed to upload overlay. Link will be created without overlay.');
          finalOverlayConfig.enabled = false;
        }
      }

      const { error } = await supabase
        .from('upload_tokens')
        .insert({
          name: formData.name,
          folder_id: formData.folder_id,
          max_uploads: formData.max_uploads,
          expires_at: expiresAt,
          created_by: user?.id,
          overlay_config: finalOverlayConfig,
          success_config: successConfig,
        });

      if (error) throw error;

      setFormData({
        name: '',
        folder_id: '',
        max_uploads: 100,
        expires_in_days: 90,
      });
      setNoExpiration(false);
      setOverlayConfig({
        enabled: false,
        url: '/overlay.png',
        position: 'bottom-right',
        opacity: 0.8,
        scale: 0.3,
      });
      setOverlayFile(null);
      setOverlayPreview(null);
      setSuccessConfig({
        show_photo: true,
        title: 'Upload Successful!',
        message: 'Your photo has been uploaded and is awaiting approval.',
        button_text: '📸 DO IT AGAIN!',
        enable_redirect: false,
        redirect_url: '',
        redirect_delay: 3000,
      });
      setShowCreateForm(false);
      loadTokens();
    } catch (err) {
      console.error('Error creating token:', err);
    }
  };

  const toggleTokenStatus = async (tokenId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('upload_tokens')
        .update({ is_active: !currentStatus })
        .eq('id', tokenId);

      if (error) throw error;
      loadTokens();
    } catch (err) {
      console.error('Error updating token:', err);
    }
  };

  const openEditForm = (token: UploadToken) => {
    setEditingToken(token);
    setFormData({
      name: token.name,
      folder_id: token.folder_id,
      max_uploads: token.max_uploads,
      expires_in_days: 90,
    });
    setNoExpiration(!token.expires_at);
    setOverlayConfig(token.overlay_config || {
      enabled: false,
      url: '/overlay.png',
      position: 'bottom-right',
      opacity: 0.8,
      scale: 0.3,
    });
    setSuccessConfig(token.success_config || {
      show_photo: true,
      title: 'Upload Successful!',
      message: 'Your photo has been uploaded and is awaiting approval.',
      button_text: '📸 DO IT AGAIN!',
      enable_redirect: false,
      redirect_url: '',
      redirect_delay: 3000,
    });
    setOverlayFile(null);
    setOverlayPreview(null);
    setShowEditForm(true);
    setShowCreateForm(false);
  };

  const updateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingToken) return;

    try {
      let expiresAt = editingToken.expires_at;
      if (!noExpiration && expiresAt === null) {
        const date = new Date();
        date.setDate(date.getDate() + formData.expires_in_days);
        expiresAt = date.toISOString();
      } else if (noExpiration) {
        expiresAt = null;
      }

      // Upload new overlay image if provided
      let finalOverlayConfig = { ...overlayConfig };
      if (overlayConfig.enabled && overlayFile) {
        const overlayUrl = await uploadOverlayImage();
        if (overlayUrl) {
          finalOverlayConfig.url = overlayUrl;
        }
      }

      const { error } = await supabase
        .from('upload_tokens')
        .update({
          name: formData.name,
          folder_id: formData.folder_id,
          max_uploads: formData.max_uploads,
          expires_at: expiresAt,
          overlay_config: finalOverlayConfig,
          success_config: successConfig,
        })
        .eq('id', editingToken.id);

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      setShowEditForm(false);
      setEditingToken(null);
      setFormData({
        name: '',
        folder_id: '',
        max_uploads: 100,
        expires_in_days: 90,
      });
      setNoExpiration(false);
      setOverlayConfig({
        enabled: false,
        url: '/overlay.png',
        position: 'bottom-right',
        opacity: 0.8,
        scale: 0.3,
      });
      setOverlayFile(null);
      setOverlayPreview(null);
      setSuccessConfig({
        show_photo: true,
        title: 'Upload Successful!',
        message: 'Your photo has been uploaded and is awaiting approval.',
        button_text: '📸 DO IT AGAIN!',
        enable_redirect: false,
        redirect_url: '',
        redirect_delay: 3000,
      });
      loadTokens();
    } catch (err) {
      console.error('Error updating token:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to update link: ${errorMessage}\n\nIf you see a column error, you may need to run database migrations.`);
    }
  };

  const deleteToken = async (tokenId: string, tokenName: string) => {
    if (!confirm(`Are you sure you want to delete "${tokenName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('upload_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) throw error;
      loadTokens();
    } catch (err) {
      console.error('Error deleting token:', err);
    }
  };

  const getUploadUrl = (tokenId: string) => {
    return `${window.location.origin}/capture?t=${tokenId}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const openQrModal = (url: string, name: string) => {
    setSelectedQrUrl(url);
    setSelectedQrName(name);
    setShowQrModal(true);
  };

  const downloadQrCode = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 1024;
    canvas.height = 1024;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 1024, 1024);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `qr-${selectedQrName.replace(/\s+/g, '-').toLowerCase()}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error('Error loading admins:', err);
    } finally {
      setAdminsLoading(false);
    }
  };

  const deleteAdmin = async (adminId: string, email: string) => {
    if (!confirm(`Remove ${email} from admins?`)) return;

    try {
      const { error } = await supabase
        .from('admins')
        .delete()
        .eq('id', adminId);

      if (error) throw error;
      loadAdmins();
    } catch (err) {
      console.error('Error deleting admin:', err);
    }
  };

  const inviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password: invitePassword,
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('Failed to create user');
      }

      // Also save to admins table for listing
      const { error: adminError } = await supabase
        .from('admins')
        .insert({
          auth_user_id: data.user.id,
          email: inviteEmail,
          created_by: user?.id,
        });

      if (adminError) {
        console.error('Error saving to admins table:', adminError);
        // Don't throw - auth user was created successfully
      }

      setInviteMessage({
        type: 'success',
        text: `Admin account created for ${inviteEmail}. Share the password with them to login.`
      });
      setInviteEmail('');
      setInvitePassword('');
      loadAdmins();
    } catch (err) {
      setInviteMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create admin'
      });
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admin Portal</h1>
              <p className="text-sm text-slate-600 mt-1">{user?.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/admin/folders"
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Folders
              </Link>
              <Link
                to="/admin/approvals"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                View Uploads
              </Link>
              <button
                onClick={() => {
                  loadAdmins();
                  setShowAdminsModal(true);
                }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <Users className="w-4 h-4" />
                Admins
              </button>
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Invite
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Upload Links</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Link
            </button>
          </div>

          {showCreateForm && (
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Upload Link</h3>
              <form onSubmit={createToken} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Link Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Wedding Reception, Conference Day 1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Folder
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.folder_id}
                      onChange={(e) => setFormData({ ...formData, folder_id: e.target.value })}
                      required
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select a folder...</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.icon} {folder.name}
                        </option>
                      ))}
                    </select>
                    <Link
                      to="/admin/folders"
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors whitespace-nowrap"
                      title="Manage folders"
                    >
                      + New
                    </Link>
                  </div>
                  {folders.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No folders yet. <Link to="/admin/folders" className="underline">Create one first</Link>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Max Uploads
                    </label>
                    <input
                      type="number"
                      value={formData.max_uploads}
                      onChange={(e) => setFormData({ ...formData, max_uploads: parseInt(e.target.value) })}
                      required
                      min="1"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Expires In (days)
                    </label>
                    <input
                      type="number"
                      value={formData.expires_in_days}
                      onChange={(e) => setFormData({ ...formData, expires_in_days: parseInt(e.target.value) })}
                      required
                      min="1"
                      disabled={noExpiration}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="no-expiration"
                    checked={noExpiration}
                    onChange={(e) => setNoExpiration(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="no-expiration" className="ml-2 block text-sm text-slate-800">
                    Link does not expire
                  </label>
                </div>

                {/* Overlay Configuration */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <div className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      id="overlay-enabled"
                      checked={overlayConfig.enabled}
                      onChange={(e) => setOverlayConfig({ ...overlayConfig, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="overlay-enabled" className="ml-2 block text-sm font-medium text-slate-800">
                      Apply watermark/overlay to photos
                    </label>
                  </div>

                  {overlayConfig.enabled && (
                    <div className="ml-6 space-y-4 bg-slate-50 p-4 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Upload Overlay Image
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleOverlayFileChange}
                          className="w-full text-sm text-slate-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-50 file:text-blue-700
                            hover:file:bg-blue-100
                            cursor-pointer"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {uploadingOverlay ? 'Uploading...' : 'Upload a PNG or image file for the watermark'}
                        </p>
                        
                        {/* Preview */}
                        {overlayPreview && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-slate-700 mb-1">Preview:</p>
                            <div className="relative w-32 h-32 bg-white border-2 border-slate-200 rounded-lg overflow-hidden">
                              <img 
                                src={overlayPreview} 
                                alt="Overlay preview" 
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Position
                        </label>
                        <select
                          value={overlayConfig.position}
                          onChange={(e) => setOverlayConfig({ ...overlayConfig, position: e.target.value as OverlayConfig['position'] })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        >
                          <option value="bottom-right">Bottom Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="top-left">Top Left</option>
                          <option value="center">Center</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Opacity ({(overlayConfig.opacity * 100).toFixed(0)}%)
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={overlayConfig.opacity}
                            onChange={(e) => setOverlayConfig({ ...overlayConfig, opacity: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Size ({(overlayConfig.scale * 100).toFixed(0)}%)
                          </label>
                          <input
                            type="range"
                            min="0.05"
                            max="1.0"
                            step="0.05"
                            value={overlayConfig.scale}
                            onChange={(e) => setOverlayConfig({ ...overlayConfig, scale: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Success Screen Configuration */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-4">Success Screen Options</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="show-photo"
                        checked={successConfig.show_photo}
                        onChange={(e) => setSuccessConfig({ ...successConfig, show_photo: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="show-photo" className="ml-2 block text-sm text-slate-800">
                        Show uploaded photo on success screen
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Success Title
                      </label>
                      <input
                        type="text"
                        value={successConfig.title}
                        onChange={(e) => setSuccessConfig({ ...successConfig, title: e.target.value })}
                        placeholder="Upload Successful!"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Success Message
                      </label>
                      <textarea
                        value={successConfig.message}
                        onChange={(e) => setSuccessConfig({ ...successConfig, message: e.target.value })}
                        placeholder="Your photo has been uploaded..."
                        rows={2}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Button Text
                      </label>
                      <input
                        type="text"
                        value={successConfig.button_text}
                        onChange={(e) => setSuccessConfig({ ...successConfig, button_text: e.target.value })}
                        placeholder="📸 DO IT AGAIN!"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="enable-redirect"
                        checked={successConfig.enable_redirect}
                        onChange={(e) => setSuccessConfig({ ...successConfig, enable_redirect: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="enable-redirect" className="ml-2 block text-sm text-slate-800">
                        Auto-redirect to custom URL
                      </label>
                    </div>

                    {successConfig.enable_redirect && (
                      <div className="ml-6 space-y-3 bg-slate-50 p-4 rounded-lg">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Redirect URL
                          </label>
                          <input
                            type="url"
                            value={successConfig.redirect_url}
                            onChange={(e) => setSuccessConfig({ ...successConfig, redirect_url: e.target.value })}
                            placeholder="https://example.com/thank-you"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Delay (milliseconds)
                          </label>
                          <input
                            type="number"
                            value={successConfig.redirect_delay}
                            onChange={(e) => setSuccessConfig({ ...successConfig, redirect_delay: parseInt(e.target.value) })}
                            min="1000"
                            step="500"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                          <p className="text-xs text-slate-500 mt-1">How long to wait before redirecting (1000 = 1 second)</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                  >
                    Create Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {showEditForm && editingToken && (
            <div className="bg-white rounded-xl shadow-md p-6 mb-6 border-2 border-amber-500">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Edit Upload Link</h3>
              <form onSubmit={updateToken} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Link Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Wedding Reception, Conference Day 1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Folder
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.folder_id}
                      onChange={(e) => setFormData({ ...formData, folder_id: e.target.value })}
                      required
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select a folder...</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.icon} {folder.name}
                        </option>
                      ))}
                    </select>
                    <Link
                      to="/admin/folders"
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors whitespace-nowrap"
                      title="Manage folders"
                    >
                      + New
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Max Uploads
                    </label>
                    <input
                      type="number"
                      value={formData.max_uploads}
                      onChange={(e) => setFormData({ ...formData, max_uploads: parseInt(e.target.value) })}
                      required
                      min="1"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Current Uploads
                    </label>
                    <input
                      type="number"
                      value={editingToken.upload_count}
                      disabled
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600"
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit-no-expiration"
                    checked={noExpiration}
                    onChange={(e) => setNoExpiration(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="edit-no-expiration" className="ml-2 block text-sm text-slate-800">
                    Link does not expire
                  </label>
                </div>

                {/* Overlay Configuration */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <div className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      id="edit-overlay-enabled"
                      checked={overlayConfig.enabled}
                      onChange={(e) => setOverlayConfig({ ...overlayConfig, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="edit-overlay-enabled" className="ml-2 block text-sm font-medium text-slate-800">
                      Apply watermark/overlay to photos
                    </label>
                  </div>

                  {overlayConfig.enabled && (
                    <div className="ml-6 space-y-4 bg-slate-50 p-4 rounded-lg">
                      {/* Current Overlay */}
                      {overlayConfig.url && !overlayFile && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-slate-700 mb-2">Current Overlay:</p>
                          <div className="relative w-32 h-32 bg-white border-2 border-slate-200 rounded-lg overflow-hidden">
                            <img 
                              src={overlayConfig.url} 
                              alt="Current overlay" 
                              className="w-full h-full object-contain"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {overlayFile ? 'Replace' : 'Change'} Overlay Image
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleOverlayFileChange}
                          className="w-full text-sm text-slate-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-amber-50 file:text-amber-700
                            hover:file:bg-amber-100
                            cursor-pointer"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {uploadingOverlay ? 'Uploading...' : 'Upload a new image to replace the current overlay'}
                        </p>
                        
                        {/* New Preview */}
                        {overlayPreview && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-slate-700 mb-1">New Preview:</p>
                            <div className="relative w-32 h-32 bg-white border-2 border-amber-200 rounded-lg overflow-hidden">
                              <img 
                                src={overlayPreview} 
                                alt="New overlay preview" 
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Position
                        </label>
                        <select
                          value={overlayConfig.position}
                          onChange={(e) => setOverlayConfig({ ...overlayConfig, position: e.target.value as OverlayConfig['position'] })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                        >
                          <option value="bottom-right">Bottom Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="top-right">Top Right</option>
                          <option value="top-left">Top Left</option>
                          <option value="center">Center</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Opacity ({(overlayConfig.opacity * 100).toFixed(0)}%)
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={overlayConfig.opacity}
                            onChange={(e) => setOverlayConfig({ ...overlayConfig, opacity: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Size ({(overlayConfig.scale * 100).toFixed(0)}%)
                          </label>
                          <input
                            type="range"
                            min="0.05"
                            max="1.0"
                            step="0.05"
                            value={overlayConfig.scale}
                            onChange={(e) => setOverlayConfig({ ...overlayConfig, scale: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Success Screen Configuration */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-4">Success Screen Options</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="edit-show-photo"
                        checked={successConfig.show_photo}
                        onChange={(e) => setSuccessConfig({ ...successConfig, show_photo: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="edit-show-photo" className="ml-2 block text-sm text-slate-800">
                        Show uploaded photo on success screen
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Success Title
                      </label>
                      <input
                        type="text"
                        value={successConfig.title}
                        onChange={(e) => setSuccessConfig({ ...successConfig, title: e.target.value })}
                        placeholder="Upload Successful!"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Success Message
                      </label>
                      <textarea
                        value={successConfig.message}
                        onChange={(e) => setSuccessConfig({ ...successConfig, message: e.target.value })}
                        placeholder="Your photo has been uploaded..."
                        rows={2}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Button Text
                      </label>
                      <input
                        type="text"
                        value={successConfig.button_text}
                        onChange={(e) => setSuccessConfig({ ...successConfig, button_text: e.target.value })}
                        placeholder="📸 DO IT AGAIN!"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="edit-enable-redirect"
                        checked={successConfig.enable_redirect}
                        onChange={(e) => setSuccessConfig({ ...successConfig, enable_redirect: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="edit-enable-redirect" className="ml-2 block text-sm text-slate-800">
                        Auto-redirect to custom URL
                      </label>
                    </div>

                    {successConfig.enable_redirect && (
                      <div className="ml-6 space-y-3 bg-slate-50 p-4 rounded-lg">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Redirect URL
                          </label>
                          <input
                            type="url"
                            value={successConfig.redirect_url}
                            onChange={(e) => setSuccessConfig({ ...successConfig, redirect_url: e.target.value })}
                            placeholder="https://example.com/thank-you"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Delay (milliseconds)
                          </label>
                          <input
                            type="number"
                            value={successConfig.redirect_delay}
                            onChange={(e) => setSuccessConfig({ ...successConfig, redirect_delay: parseInt(e.target.value) })}
                            min="1000"
                            step="500"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                          />
                          <p className="text-xs text-slate-500 mt-1">How long to wait before redirecting (1000 = 1 second)</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={uploadingOverlay}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploadingOverlay ? 'Uploading...' : 'Update Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditForm(false);
                      setEditingToken(null);
                      setOverlayFile(null);
                      setOverlayPreview(null);
                    }}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading links...</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <QrCode className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No upload links yet</h3>
            <p className="text-slate-600">Create your first upload link to get started</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tokens.map((token) => {
              const isExpired = token.expires_at ? new Date(token.expires_at) < new Date() : false;
              const uploadUrl = getUploadUrl(token.id);

              return (
                <div key={token.id} className="bg-white rounded-xl shadow-md p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 mb-1">{token.name}</h3>
                      <p className="text-sm text-slate-600">Folder: {token.folder_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          token.is_active && !isExpired
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isExpired ? 'Expired' : token.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {!isExpired && (
                        <button
                          onClick={() => toggleTokenStatus(token.id, token.is_active)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {token.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Hash className="w-4 h-4" />
                      {token.upload_count} / {token.max_uploads} uploads
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar className="w-4 h-4" />
                      Expires {token.expires_at ? new Date(token.expires_at).toLocaleDateString() : 'Never'}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-slate-600 mb-1">Upload URL:</p>
                    <code className="text-xs text-slate-800 break-all">{uploadUrl}</code>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(uploadUrl)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Copy Link
                    </button>
                    <button
                      onClick={() => openQrModal(uploadUrl, token.name)}
                      className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                      View QR
                    </button>
                    <button
                      onClick={() => openEditForm(token)}
                      className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                      title="Edit link"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteToken(token.id, token.name)}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                      title="Delete link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showQrModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowQrModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">QR Code</h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-slate-700 mb-4">{selectedQrName}</p>
              <div ref={qrRef} className="bg-white p-4 rounded-lg border-2 border-slate-200 flex items-center justify-center">
                {selectedQrUrl && (
                  <QRCodeSVG
                    value={selectedQrUrl}
                    size={256}
                    level="H"
                  />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={downloadQrCode}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                <Download className="w-5 h-5" />
                Download QR Code
              </button>
              <button
                onClick={() => copyToClipboard(selectedQrUrl)}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Create Admin Account</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteMessage(null);
                  setInviteEmail('');
                  setInvitePassword('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={inviteAdmin} className="space-y-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label htmlFor="invite-password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="invite-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              {inviteMessage && (
                <div className={`p-3 rounded-lg ${inviteMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {inviteMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={inviteLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                {inviteLoading ? 'Creating...' : 'Create Admin'}
              </button>
            </form>

            <p className="text-xs text-slate-500 mt-4 text-center">
              Share the email and password with the new admin so they can sign in.
            </p>
          </div>
        </div>
      )}

      {showAdminsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setShowAdminsModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Admin Users</h3>
              <button
                onClick={() => setShowAdminsModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {adminsLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-600">Loading admins...</p>
              </div>
            ) : admins.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-600">No admins found</p>
                <p className="text-sm text-slate-500 mt-1">Add the current user to the admins table</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {admins.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between bg-slate-50 rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{admin.email}</p>
                      <p className="text-xs text-slate-500">
                        Added {new Date(admin.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {admin.email !== user?.email && (
                      <button
                        onClick={() => deleteAdmin(admin.id, admin.email)}
                        className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowAdminsModal(false);
                  setShowInviteModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                Invite New Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
