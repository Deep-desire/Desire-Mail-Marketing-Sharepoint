import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Edit2, CheckCircle, XCircle, RefreshCw,
  Shield, Database, Link, ChevronRight, X, Eye, EyeOff,
  AlertTriangle, Wifi, WifiOff, Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadApi } from '../api/upload.api';
import { SharePointConfig } from '../types';

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FormState {
  name: string;
  siteId: string;
  listId: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sortOrder: number;
}

const emptyForm: FormState = {
  name: '',
  siteId: '',
  listId: '',
  tenantId: '',
  clientId: '',
  clientSecret: '',
  sortOrder: 0,
};

function ConfigModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  initial?: SharePointConfig;
  onClose: () => void;
  onSaved: (config: SharePointConfig) => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          name: initial.name,
          siteId: initial.siteId,
          listId: initial.listId,
          tenantId: initial.tenantId || '',
          clientId: initial.clientId || '',
          clientSecret: '', // never pre-fill the secret
          sortOrder: initial.sortOrder,
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const field = (key: keyof FormState, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleTest = async () => {
    if (!initial?.id) {
      toast.error('Save the config first, then test it');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await uploadApi.testSharePointConfig(initial.id);
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: 'Request failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.siteId.trim() || !form.listId.trim()) {
      toast.error('Name, Site ID and List ID are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        siteId: form.siteId.trim(),
        listId: form.listId.trim(),
        tenantId: form.tenantId.trim() || undefined,
        clientId: form.clientId.trim() || undefined,
        clientSecret: form.clientSecret.trim() || undefined,
        sortOrder: Number(form.sortOrder) || 0,
      };

      let saved: SharePointConfig;
      if (mode === 'create') {
        const res = await uploadApi.createSharePointConfig(payload);
        saved = res.data;
        toast.success(`"${saved.name}" created`);
      } else {
        const res = await uploadApi.updateSharePointConfig(initial!.id, payload);
        saved = res.data;
        toast.success(`"${saved.name}" updated`);
      }
      onSaved(saved);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-brand-950/95 border border-white/10 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {mode === 'create' ? 'Add SharePoint List' : 'Edit SharePoint List'}
              </h2>
              <p className="text-xs text-gray-500">
                {mode === 'create'
                  ? 'Connect a new SharePoint list as a contacts source'
                  : 'Update the configuration for this list'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">List Identity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Display Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="config-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => field('name', e.target.value)}
                  placeholder='e.g. "Marketing Contacts Q3"'
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  SharePoint Site ID <span className="text-red-400">*</span>
                </label>
                <input
                  id="config-site-id"
                  type="text"
                  value={form.siteId}
                  onChange={(e) => field('siteId', e.target.value)}
                  placeholder='e.g. tenant.sharepoint.com,abc-xxx,def-yyy'
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition placeholder-gray-600 font-mono"
                />
                <p className="text-xs text-gray-600 mt-1">Found in the SP_SITE_ID format: host,siteGuid,webGuid</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  List ID <span className="text-red-400">*</span>
                </label>
                <input
                  id="config-list-id"
                  type="text"
                  value={form.listId}
                  onChange={(e) => field('listId', e.target.value)}
                  placeholder='e.g. 6a0c9cb8-aa15-48f4-b242-62041a87f29a'
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition placeholder-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Sort Order</label>
                <input
                  id="config-sort-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => field('sortOrder', parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-24 bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Credentials — optional override */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Credentials Override
              </h3>
              <span className="text-xs text-gray-600 italic">(optional — blank = use system defaults from .env)</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Tenant ID</label>
                <input
                  id="config-tenant-id"
                  type="text"
                  value={form.tenantId}
                  onChange={(e) => field('tenantId', e.target.value)}
                  placeholder="Leave blank to use system default"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition placeholder-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Client ID (App ID)</label>
                <input
                  id="config-client-id"
                  type="text"
                  value={form.clientId}
                  onChange={(e) => field('clientId', e.target.value)}
                  placeholder="Leave blank to use system default"
                  className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition placeholder-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Client Secret</label>
                <div className="relative">
                  <input
                    id="config-client-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={form.clientSecret}
                    onChange={(e) => field('clientSecret', e.target.value)}
                    placeholder={initial?.clientSecret ? 'Enter new value to update (currently set)' : 'Leave blank to use system default'}
                    className="w-full bg-white/5 border border-white/10 focus:border-brand-500 rounded-xl px-4 py-2.5 pr-12 text-white text-sm outline-none transition placeholder-gray-600 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Test result banner */}
          {testResult && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {testResult.success
                ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              <div>
                <p className="text-sm font-semibold">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</p>
                <p className="text-xs mt-0.5 opacity-80">{testResult.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 gap-3">
          <button
            id="test-connection-btn"
            onClick={handleTest}
            disabled={testing || mode === 'create'}
            title={mode === 'create' ? 'Save first, then test' : 'Test connection to this SharePoint list'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:text-white hover:border-white/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            Test Connection
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition">
              Cancel
            </button>
            <button
              id="save-config-btn"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create List' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SharePointSettings() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<SharePointConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingConfig, setEditingConfig] = useState<SharePointConfig | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await uploadApi.getSharePointConfigs();
      setConfigs(res.data.configs);
    } catch {
      toast.error('Failed to load SharePoint configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleSaved = (config: SharePointConfig) => {
    setConfigs((prev) => {
      const exists = prev.findIndex((c) => c.id === config.id);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = config;
        return updated;
      }
      return [...prev, config];
    });
    setModalMode(null);
    setEditingConfig(undefined);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await uploadApi.deleteSharePointConfig(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      toast.success('Configuration deleted');
    } catch {
      toast.error('Failed to delete configuration');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResults((r) => ({ ...r, [id]: { success: false, message: 'Testing…' } }));
    try {
      const res = await uploadApi.testSharePointConfig(id);
      setTestResults((r) => ({ ...r, [id]: res.data }));
    } catch {
      setTestResults((r) => ({ ...r, [id]: { success: false, message: 'Request failed' } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (config: SharePointConfig) => {
    setTogglingId(config.id);
    try {
      const res = await uploadApi.updateSharePointConfig(config.id, { isActive: !config.isActive });
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? res.data : c)));
      toast.success(`"${config.name}" ${!config.isActive ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <button onClick={() => navigate('/contacts')} className="hover:text-gray-300 transition">Contacts</button>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-300">SharePoint Lists</span>
          </div>
          <h1 className="page-title flex items-center gap-3">
            <Settings className="w-6 h-6 text-brand-400" />
            SharePoint List Manager
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Add, edit, or remove SharePoint lists used as contact sources. Changes take effect immediately — no server restart required.
          </p>
        </div>
        <button
          id="add-sharepoint-list-btn"
          onClick={() => { setEditingConfig(undefined); setModalMode('create'); }}
          className="btn-primary flex items-center gap-2 h-10 px-5 rounded-xl shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add List
        </button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
        <Shield className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
        <div className="text-sm">
          <p className="font-semibold text-blue-300 mb-0.5">Credential Fallback</p>
          <p className="text-blue-400/80">
            Credentials left blank will automatically use the system defaults from your <code className="text-blue-300 bg-blue-500/20 px-1 rounded">.env</code> file
            (<code className="text-blue-300 bg-blue-500/20 px-1 rounded">TENANT_ID</code>,
            <code className="text-blue-300 bg-blue-500/20 px-1 rounded">SP_CLIENT_ID</code>,
            <code className="text-blue-300 bg-blue-500/20 px-1 rounded">SP_CLIENT_SECRET</code>).
            You only need to fill credentials if this list uses a different Azure app registration.
          </p>
        </div>
      </div>

      {/* Config list */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-20">
            <Database className="w-16 h-16 mx-auto text-gray-700 mb-4" />
            <p className="text-white font-semibold text-lg">No SharePoint lists configured</p>
            <p className="text-gray-500 text-sm mt-2 mb-6">
              Add your first list to start syncing contacts from SharePoint.
            </p>
            <button
              onClick={() => { setEditingConfig(undefined); setModalMode('create'); }}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              Add Your First List
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Name</span>
              <span>Site / List</span>
              <span>Status</span>
              <span>Connection</span>
              <span className="text-right">Actions</span>
            </div>

            {configs.map((cfg) => {
              const result = testResults[cfg.id];
              return (
                <div key={cfg.id} className={`grid grid-cols-[2fr_3fr_auto_auto_auto] gap-4 items-center px-6 py-4 hover:bg-white/5 transition-colors ${!cfg.isActive ? 'opacity-50' : ''}`}>
                  {/* Name */}
                  <div>
                    <p className="text-sm font-semibold text-white">{cfg.name}</p>
                    <p className="text-xs text-gray-500">Order: {cfg.sortOrder}</p>
                  </div>

                  {/* IDs */}
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link className="w-3 h-3 text-gray-500 shrink-0" />
                      <p className="text-xs text-gray-400 font-mono truncate" title={cfg.siteId}>{cfg.siteId}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Database className="w-3 h-3 text-gray-500 shrink-0" />
                      <p className="text-xs text-gray-400 font-mono truncate" title={cfg.listId}>{cfg.listId}</p>
                    </div>
                    {cfg.tenantId && (
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-brand-500/60 shrink-0" />
                        <p className="text-xs text-brand-400/60 font-mono truncate">Custom credentials</p>
                      </div>
                    )}
                  </div>

                  {/* Active toggle */}
                  <div>
                    <button
                      onClick={() => handleToggleActive(cfg)}
                      disabled={togglingId === cfg.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        cfg.isActive
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-red-500/15 hover:text-red-400'
                          : 'bg-gray-500/15 text-gray-400 hover:bg-emerald-500/15 hover:text-emerald-400'
                      }`}
                    >
                      {cfg.isActive
                        ? <><CheckCircle className="w-3.5 h-3.5" /> Active</>
                        : <><XCircle className="w-3.5 h-3.5" /> Disabled</>}
                    </button>
                  </div>

                  {/* Test result */}
                  <div>
                    {result ? (
                      <div className={`flex items-center gap-1 text-xs ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.success ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{result.success ? 'OK' : 'Failed'}</span>
                      </div>
                    ) : (
                      <button
                        id={`test-btn-${cfg.id}`}
                        onClick={() => handleTest(cfg.id)}
                        disabled={testingId === cfg.id}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400 transition"
                      >
                        {testingId === cfg.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Wifi className="w-3.5 h-3.5" />}
                        Test
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      id={`edit-btn-${cfg.id}`}
                      onClick={() => { setEditingConfig(cfg); setModalMode('edit'); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      id={`delete-btn-${cfg.id}`}
                      onClick={() => handleDelete(cfg.id)}
                      disabled={deletingId === cfg.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingId === cfg.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test result details (if any failures with messages) */}
      {Object.entries(testResults).some(([, r]) => !r.success && r.message !== 'Testing…') && (
        <div className="space-y-2">
          {Object.entries(testResults)
            .filter(([, r]) => !r.success && r.message !== 'Testing…')
            .map(([id, result]) => {
              const cfg = configs.find((c) => c.id === id);
              return (
                <div key={id} className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/10">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">{cfg?.name || id}</p>
                    <p className="text-xs text-red-400/70 mt-0.5">{result.message}</p>
                  </div>
                  <button onClick={() => setTestResults((r) => { const n = { ...r }; delete n[id]; return n; })} className="ml-auto text-red-400/60 hover:text-red-300 transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <ConfigModal
          mode={modalMode}
          initial={editingConfig}
          onClose={() => { setModalMode(null); setEditingConfig(undefined); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
