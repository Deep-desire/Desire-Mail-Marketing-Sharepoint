import { useState, useEffect } from 'react';
import {
  MailX, Plus, Trash2, Search, AlertTriangle, Loader2,
  Mail, X, ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadApi } from '../api/upload.api';

interface UnsubscribedRecord {
  id: string;
  email: string;
  token: string;
  createdAt: string;
}

export default function UnsubscribedSettings() {
  const [unsubscribed, setUnsubscribed] = useState<UnsubscribedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UnsubscribedRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchUnsubscribed();
  }, []);

  const fetchUnsubscribed = async () => {
    setLoading(true);
    try {
      const res = await uploadApi.getUnsubscribed();
      setUnsubscribed(res.data.unsubscribed || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load unsubscribed list');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToSuppress = newEmail.trim().toLowerCase();
    if (!emailToSuppress) return;

    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToSuppress)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setAdding(true);
    try {
      await uploadApi.addUnsubscribed(emailToSuppress);
      toast.success(`Successfully unsubscribed ${emailToSuppress}`);
      setNewEmail('');
      fetchUnsubscribed();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add email to suppression list');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await uploadApi.removeUnsubscribed(confirmDelete.id);
      toast.success(`Re-subscribed ${confirmDelete.email}`);
      setConfirmDelete(null);
      fetchUnsubscribed();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to re-subscribe email');
    } finally {
      setDeleting(false);
    }
  };

  const filteredList = unsubscribed.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.email.toLowerCase().includes(query) ||
      item.token.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <MailX className="w-8 h-8 text-brand-600" />
            Unsubscribed Suppression List
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Auditing suppression registry. Emails on this list are automatically skipped during campaign syncs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Manual Add Form Panel */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 space-y-4 bg-white border border-gray-200 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
              <Mail className="w-5 h-5 text-brand-600" />
              <h2 className="section-title text-base">Suppress Email</h2>
            </div>
            <p className="text-xs text-gray-500">
              Manually add an email address to the suppression list. This block overrides all lists and formats.
            </p>

            <form onSubmit={handleAddEmail} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Email Address *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="contact@example.com"
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={adding || !newEmail.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Manually Suppress
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* suppression List Table Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 overflow-hidden bg-white border border-gray-200 shadow-sm animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h2 className="section-title flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-brand-600" />
                Suppressed Addresses ({filteredList.length})
              </h2>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search email or token..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 pl-8 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 w-full shadow-sm"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 animate-pulse py-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Mail className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <p className="text-sm font-semibold text-gray-700">No suppressed emails found</p>
                <p className="text-xs text-gray-505 mt-1">Add emails manually or trigger public unsubscribe links to populate this list.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full table-fixed min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                      <th className="px-4 py-3 w-12">#</th>
                      <th className="px-4 py-3 w-[40%]">Email Address</th>
                      <th className="px-4 py-3 w-[25%]">Unsubscribe Token</th>
                      <th className="px-4 py-3 w-[20%]">Date Added</th>
                      <th className="px-4 py-3 w-28 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {filteredList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50/40 transition-colors group">
                        <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 truncate" title={item.email}>
                          {item.email}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate" title={item.token}>
                          {item.token}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setConfirmDelete(item)}
                            className="p-1.5 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg text-gray-500 hover:text-red-650 hover:text-red-600 transition-all shadow-sm"
                            title="Re-subscribe contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
          <div className="absolute inset-0" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-2xl p-6 space-y-6 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center border border-red-200 shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Re-subscribe Email?</h3>
                <p className="text-xs text-gray-500 mt-0.5">This will remove the email from the suppression registry.</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl font-mono text-xs text-gray-900 font-semibold truncate shadow-inner">
              {confirmDelete.email}
            </div>

            <p className="text-xs text-gray-500">
              Removing this address means they can receive future campaigns sent to lists they are part of. Are you sure you want to proceed?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRecord}
                disabled={deleting}
                className="btn-primary bg-red-600 hover:bg-red-700 text-xs px-4 py-2 font-semibold flex items-center gap-2"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Re-subscribe'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
