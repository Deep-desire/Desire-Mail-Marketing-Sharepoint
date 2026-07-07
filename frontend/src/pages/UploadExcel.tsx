import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Eye, FileSpreadsheet, Calendar, List, ArrowRight, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import FileUpload from '../components/FileUpload';
import { uploadApi } from '../api/upload.api';
import { Upload } from '../types';
import StatusBadge from '../components/StatusBadge';

export default function UploadExcel() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Upload | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit and Delete states
  const [editingUpload, setEditingUpload] = useState<Upload | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingUpload, setDeletingUpload] = useState<Upload | null>(null);

  const fetchUploads = async () => {
    try {
      const res = await uploadApi.getAll();
      setUploads(res.data);
    } catch (err) {
      toast.error('Failed to load previous uploads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadApi.uploadExcel(file);
      setResult(res.data);
      toast.success('File uploaded and processed!');
      fetchUploads(); // Refresh history list
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!editingUpload || !editName.trim()) return;
    try {
      await uploadApi.update(editingUpload.id, {
        fileName: editName.trim(),
        originalName: editName.trim(),
      });
      toast.success('Upload renamed successfully');
      setEditingUpload(null);
      fetchUploads();
    } catch (err) {
      toast.error('Failed to rename upload');
    }
  };

  const handleDelete = async () => {
    if (!deletingUpload) return;
    try {
      await uploadApi.delete(deletingUpload.id);
      toast.success('Upload deleted successfully');
      setDeletingUpload(null);
      fetchUploads();
    } catch (err) {
      toast.error('Failed to delete upload');
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-5">
        <h1 className="page-title">Upload Contacts</h1>
        <p className="text-gray-500 mt-1">Upload a .xlsx spreadsheet with contact lists and view history</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Container */}
        <div className="lg:col-span-1 space-y-6 animate-fade-in">
          <div className="glass-card p-6 bg-white border border-gray-200 shadow-sm">
            <h2 className="section-title mb-4 border-b border-gray-105 border-gray-100 pb-3">New Upload</h2>
            <FileUpload onFileSelect={handleUpload} isUploading={uploading} />
          </div>

          {/* Upload Result Summary */}
          {result && (
            <div className="animate-slide-up">
              <div className="glass-card p-6 space-y-4 border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm rounded-2xl">
                <h2 className="section-title flex items-center gap-2 text-emerald-705 text-emerald-800 text-base font-bold pb-2 border-b border-emerald-200/50">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Latest Upload Summary
                </h2>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-white border border-gray-205 border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-xs text-gray-500 font-semibold">Total Rows</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{result.totalRows}</p>
                  </div>
                  <div className="bg-white border border-gray-205 border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-xs text-emerald-600 font-semibold">Valid</p>
                    <p className="text-lg font-bold text-emerald-600 mt-0.5">{result.validEmails}</p>
                  </div>
                  <div className="bg-white border border-gray-205 border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-xs text-red-600 font-semibold">Invalid</p>
                    <p className="text-lg font-bold text-red-600 mt-0.5">{result.invalidEmails}</p>
                  </div>
                  <div className="bg-white border border-gray-205 border-gray-200 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-xs text-amber-600 font-semibold">Duplicates</p>
                    <p className="text-lg font-bold text-amber-600 mt-0.5">{result.duplicateEmails}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => navigate(`/uploads/${result.id}`)}
                    className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 w-full justify-center shadow-sm"
                  >
                    View Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setResult(null)}
                    className="btn-secondary text-xs py-2 px-3 w-full justify-center shadow-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Uploads History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 overflow-hidden bg-white border border-gray-200 shadow-sm animate-fade-in">
            <h2 className="section-title flex items-center gap-2 mb-4">
              <List className="w-5 h-5 text-brand-600" />
              Upload History
            </h2>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : uploads.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700">No spreadsheets uploaded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-55 bg-gray-50/50">
                      <th className="px-4 py-3">File Details</th>
                      <th className="px-4 py-3 text-center">Total Rows</th>
                      <th className="px-4 py-3 text-center">Valid</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-705 text-gray-700">
                    {uploads.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 max-w-[200px] truncate" title={u.originalName}>
                            {u.originalName}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {new Date(u.createdAt).toLocaleDateString()} {new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-800">{u.totalRows}</td>
                        <td className="px-4 py-3 text-center text-emerald-600 font-bold">{u.validEmails}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/uploads/${u.id}`)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-brand-50 hover:text-brand-700 text-gray-700 transition-all inline-flex items-center gap-1 text-xs font-semibold shadow-sm"
                              title="View Upload Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => {
                                setEditingUpload(u);
                                setEditName(u.originalName);
                              }}
                              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-amber-50 hover:text-amber-600 text-gray-500 transition-all inline-flex items-center shadow-sm"
                              title="Rename Upload"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingUpload(u)}
                              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-red-50 hover:text-red-600 text-gray-500 transition-all inline-flex items-center shadow-sm"
                              title="Delete Upload"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUpload && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-gray-200 bg-white shadow-2xl rounded-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Rename Upload</h3>
              <button
                onClick={() => setEditingUpload(null)}
                className="text-gray-400 hover:text-gray-650 hover:text-gray-650 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700">File Display Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-405 placeholder-gray-400 focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                placeholder="Enter new name"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingUpload(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="btn-primary text-xs px-4 py-2"
                disabled={!editName.trim()}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingUpload && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-200 bg-white shadow-2xl rounded-2xl">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 pb-2 border-b border-red-100">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Delete Upload History?
            </h3>
            <p className="text-sm text-gray-500">
              Are you sure you want to delete <strong className="text-gray-900 font-semibold">"{deletingUpload.originalName}"</strong>? This will permanently delete this upload history along with all of its associated contacts. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingUpload(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs px-4 py-2 font-semibold transition-all shadow-sm"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
