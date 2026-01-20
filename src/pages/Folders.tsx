import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, Edit, Trash2, Archive, CheckCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Folder {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  created_at: string;
  status: 'active' | 'archived' | 'completed';
  link_count?: number;
  upload_count?: number;
}

export default function Folders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '📁',
    color: '#3B82F6',
  });

  const FOLDER_ICONS = ['📁', '📸', '🎊', '💍', '🎓', '⚽', '🎨', '🎪', '🏢', '📅'];
  const FOLDER_COLORS = [
    { value: '#3B82F6', label: 'Blue' },
    { value: '#EF4444', label: 'Red' },
    { value: '#10B981', label: 'Green' },
    { value: '#F59E0B', label: 'Amber' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
  ];

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load counts for each folder
      const foldersWithCounts = await Promise.all(
        (data || []).map(async (folder) => {
          // Count links
          const { count: linkCount } = await supabase
            .from('upload_tokens')
            .select('*', { count: 'exact', head: true })
            .eq('folder_id', folder.id);

          // Count uploads (this will work once we migrate to folder references)
          const { count: uploadCount } = await supabase
            .from('pending_uploads')
            .select('upload_tokens!inner(folder_id)', { count: 'exact', head: true })
            .eq('upload_tokens.folder_id', folder.id);

          return {
            ...folder,
            link_count: linkCount || 0,
            upload_count: uploadCount || 0,
          };
        })
      );

      setFolders(foldersWithCounts);
    } catch (err) {
      console.error('Error loading folders:', err);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase
        .from('folders')
        .insert({
          ...formData,
          created_by: user?.id,
        });

      if (error) throw error;

      setFormData({
        name: '',
        description: '',
        icon: '📁',
        color: '#3B82F6',
      });
      setShowCreateForm(false);
      loadFolders();
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder. Please try again.');
    }
  };

  const updateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder) return;

    try {
      const { error } = await supabase
        .from('folders')
        .update(formData)
        .eq('id', editingFolder.id);

      if (error) throw error;

      setFormData({
        name: '',
        description: '',
        icon: '📁',
        color: '#3B82F6',
      });
      setEditingFolder(null);
      loadFolders();
    } catch (err) {
      console.error('Error updating folder:', err);
      alert('Failed to update folder. Please try again.');
    }
  };

  const deleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Are you sure you want to delete "${folderName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
      loadFolders();
    } catch (err) {
      console.error('Error deleting folder:', err);
      alert('Cannot delete folder. It may contain upload links.');
    }
  };

  const openEditForm = (folder: Folder) => {
    setEditingFolder(folder);
    setFormData({
      name: folder.name,
      description: folder.description || '',
      icon: folder.icon,
      color: folder.color,
    });
    setShowCreateForm(false);
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
                <h1 className="text-2xl font-bold text-slate-900">Folders</h1>
                <p className="text-sm text-slate-600 mt-1">Organize your upload links by event or project</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setEditingFolder(null);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Folder
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Create/Edit Form */}
        {(showCreateForm || editingFolder) && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingFolder ? 'Edit Folder' : 'Create New Folder'}
            </h3>
            <form onSubmit={editingFolder ? updateFolder : createFolder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Johnson Wedding, Tech Conference 2025"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this event or project"
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Icon
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {FOLDER_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon })}
                        className={`text-2xl p-3 rounded-lg border-2 transition-all ${
                          formData.icon === icon
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Color
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: color.value })}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          formData.color === color.value
                            ? 'border-slate-900 ring-2 ring-offset-2 ring-slate-300'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      >
                        <span className="sr-only">{color.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  {editingFolder ? 'Update Folder' : 'Create Folder'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingFolder(null);
                    setFormData({
                      name: '',
                      description: '',
                      icon: '📁',
                      color: '#3B82F6',
                    });
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Folders Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading folders...</p>
          </div>
        ) : folders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <FolderOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No folders yet</h3>
            <p className="text-slate-600 mb-4">Create your first folder to organize your upload links</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Folder
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden"
              >
                <div
                  className="h-3"
                  style={{ backgroundColor: folder.color }}
                />
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{folder.icon}</span>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{folder.name}</h3>
                        {folder.description && (
                          <p className="text-sm text-slate-600 mt-1">{folder.description}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 text-sm text-slate-600 mb-4">
                    <div>
                      <span className="font-medium">{folder.link_count}</span> links
                    </div>
                    <div>
                      <span className="font-medium">{folder.upload_count}</span> uploads
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/admin?folder=${folder.id}`}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors text-center"
                    >
                      View Links
                    </Link>
                    <button
                      onClick={() => openEditForm(folder)}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit folder"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteFolder(folder.id, folder.name)}
                      className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
