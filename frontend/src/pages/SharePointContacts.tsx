import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Play, Eye, ChevronDown, ChevronUp, ChevronRight, Edit,
  CheckCircle, AlertCircle, XCircle, MinusCircle,
  Users, Mail, Send, History, Trash2, X, AlertTriangle,
  Calendar, Layers, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadApi } from '../api/upload.api';
import { Template, Campaign, SPContact, SharePointConfig } from '../types';
import StatusBadge from '../components/StatusBadge';

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10`}>
      <span className={color}>{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SharePointContacts() {
  const navigate = useNavigate();

  // ── Contacts state ──
  const [syncing, setSyncing] = useState(false);
  const [contacts, setContacts] = useState<SPContact[]>([]);
  const [stats, setStats] = useState({ total: 0, validCount: 0, invalidCount: 0, duplicateCount: 0, unsubscribedCount: 0 });
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid' | 'duplicate' | 'unsubscribed'>('all');
  const [syncMode, setSyncMode] = useState<'incremental' | 'full'>('incremental');
  const [searchQuery, setSearchQuery] = useState('');
  const [spConfigs, setSpConfigs] = useState<SharePointConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  // ── Wizard & Local Editing State ──
  const [step, setStep] = useState<1 | 2>(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [unsubscribedEmails, setUnsubscribedEmails] = useState<Set<string>>(new Set());

  // ── Campaign creation state ──
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [sending, setSending] = useState(false);

  // ── Campaign history state ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);

  // ── Template Preview state ──
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState('400px');
  const [senderEmail, setSenderEmail] = useState('marketing@vuf.org');

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const updateHeight = () => {
      if (iframe.contentWindow && iframe.contentDocument) {
        const body = iframe.contentDocument.body;
        const html = iframe.contentDocument.documentElement;
        const height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );
        setIframeHeight(`${height}px`);
      }
    };

    updateHeight();
    setTimeout(updateHeight, 200);
    setTimeout(updateHeight, 1000);
  };

  // ── Fetch templates, campaign history, and SharePoint configs on mount ──
  useEffect(() => {
    uploadApi.getTemplates().then((r) => setTemplates(r.data)).catch(() => { });
    fetchCampaigns();
    uploadApi.getSenderConfig()
      .then((res) => {
        if (res.data.senderEmail) {
          setSenderEmail(res.data.senderEmail);
        }
      })
      .catch(() => { });
    // Load SharePoint list configs
    setLoadingConfigs(true);
    uploadApi.getSharePointConfigs()
      .then((res) => {
        const active = res.data.configs.filter((c) => c.isActive);
        setSpConfigs(active);
        if (active.length > 0) setSelectedConfigId(active[0].id);
      })
      .catch(() => toast.error('Failed to load SharePoint list configurations'))
      .finally(() => setLoadingConfigs(false));
  }, []);

  const fetchCampaigns = async () => {
    setLoadingHistory(true);
    try {
      const res = await uploadApi.getCampaigns();
      setCampaigns(res.data);
    } catch {
      toast.error('Failed to load campaign history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // ── Sync from SharePoint ──
  const handleSync = useCallback(async () => {
    if (!selectedConfigId) {
      toast.error('Please select a SharePoint list first');
      return;
    }
    setSyncing(true);
    setContacts([]);
    try {
      const res = await uploadApi.getSharePointContacts(selectedConfigId, syncMode);
      setContacts(res.data.contacts);
      setStats({
        total: res.data.total,
        validCount: res.data.validCount,
        invalidCount: res.data.invalidCount,
        duplicateCount: res.data.duplicateCount,
        unsubscribedCount: res.data.unsubscribedCount,
      });

      // Track unsubscribed email list locally for inline edits validation
      const unsubs = new Set(
        res.data.contacts
          .filter((c: SPContact) => c.status === 'unsubscribed')
          .map((c: SPContact) => c.email.toLowerCase())
      );
      setUnsubscribedEmails(unsubs);
      setStep(1); // Reset to step 1 on new sync
      const selectedConfig = spConfigs.find((c) => c.id === selectedConfigId);
      toast.success(`Synced ${res.data.total} contacts from "${selectedConfig?.name || 'SharePoint'}" (${syncMode} mode)`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sync from SharePoint');
    } finally {
      setSyncing(false);
    }
  }, [syncMode, selectedConfigId, spConfigs]);

  // ── Create Campaign & Send ──
  const handleStartCampaign = async () => {
    if (!selectedTemplate) {
      toast.error('Please select an email template');
      return;
    }
    if (stats.validCount === 0) {
      toast.error('No valid contacts to send to. Sync first.');
      return;
    }
    setSending(true);
    try {
      const res = await uploadApi.createCampaign({
        name: campaignName || `Campaign – ${new Date().toLocaleDateString()}`,
        templateId: selectedTemplate,
        syncMode: syncMode,
        configId: selectedConfigId || undefined,
        contacts: contacts.map(c => ({ name: c.name, email: c.email, itemId: c.itemId })), // Upload the finalized local state!
      });

      const campaignId = res.data.id;
      navigate(`/campaigns/${campaignId}?launch=true`);
      setCampaignName('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start campaign');
    } finally {
      setSending(false);
    }
  };

  // ── Delete Campaign ──
  const handleDeleteCampaign = async () => {
    if (!deletingCampaign) return;
    try {
      await uploadApi.deleteCampaign(deletingCampaign.id);
      toast.success('Campaign deleted');
      setDeletingCampaign(null);
      fetchCampaigns();
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  // ── Local Recalculations for Edits & Deletes ──
  const recalculateContactsList = (
    rawContacts: { name: string; email: string; status?: string; reason?: string | null; itemId?: string }[],
    unsubSet: Set<string>
  ) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set<string>();

    let validCount = 0, invalidCount = 0, duplicateCount = 0, unsubscribedCount = 0;

    const contactsList: SPContact[] = rawContacts.map((c) => {
      const email = c.email.toLowerCase().trim();
      const name = c.name.trim();
      const itemId = c.itemId;

      if (!email || !emailRegex.test(email)) {
        invalidCount++;
        return { name, email, status: 'invalid', reason: 'Invalid email format', itemId };
      }
      if (seenEmails.has(email)) {
        duplicateCount++;
        return { name, email, status: 'duplicate', reason: 'Duplicate email in list', itemId };
      }
      seenEmails.add(email);
      if (unsubSet.has(email)) {
        unsubscribedCount++;
        return { name, email, status: 'unsubscribed', reason: 'Email is unsubscribed', itemId };
      }
      validCount++;
      return { name, email, status: 'valid', reason: null, itemId };
    });

    return {
      contacts: contactsList,
      stats: {
        total: contactsList.length,
        validCount,
        invalidCount,
        duplicateCount,
        unsubscribedCount,
      }
    };
  };

  const startEdit = (index: number, name: string, email: string) => {
    setEditingIndex(index);
    setEditName(name);
    setEditEmail(email);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const saveEdit = (index: number) => {
    const updatedRaw = contacts.map((c, idx) => {
      if (idx === index) {
        return { ...c, name: editName, email: editEmail };
      }
      return c;
    });

    const recalculated = recalculateContactsList(updatedRaw, unsubscribedEmails);
    setContacts(recalculated.contacts);
    setStats(recalculated.stats);
    setEditingIndex(null);
    toast.success('Contact updated');
  };

  const deleteContact = (index: number) => {
    const updatedRaw = contacts.filter((_, idx) => idx !== index);
    const recalculated = recalculateContactsList(updatedRaw, unsubscribedEmails);
    setContacts(recalculated.contacts);
    setStats(recalculated.stats);
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
    toast.success('Contact deleted');
  };

  // ── Filtered contacts ──
  const visibleContacts = contacts
    .filter((c) => filterStatus === 'all' || c.status === filterStatus)
    .filter((c) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        c.name?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
      );
    })
    .slice(0, showAllContacts ? undefined : 20);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'valid': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'invalid': return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'duplicate': return <MinusCircle className="w-3.5 h-3.5 text-amber-400" />;
      case 'unsubscribed': return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
      default: return null;
    }
  };

  const filteredTotal = contacts.filter((c) => filterStatus === 'all' || c.status === filterStatus).length;

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="space-y-8">
      {/* Wizard Steps indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="page-title">SharePoint Contacts Wizard</h1>
          <p className="text-gray-500 mt-1">
            {step === 1
              ? 'Step 1: Fetch contacts and customize/clean the mailing list'
              : 'Step 2: Assign campaign details, preview template, and launch'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${step === 1 ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-white/5 text-gray-400'}`}>
            <span className="w-4 h-4 rounded-full bg-brand-500/10 flex items-center justify-center text-[10px]">1</span>
            Contacts list ({stats.validCount} valid)
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${step === 2 ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-white/5 text-gray-400'}`}>
            <span className="w-4 h-4 rounded-full bg-brand-500/10 flex items-center justify-center text-[10px]">2</span>
            Campaign Launch
          </div>
        </div>
      </div>

      {step === 1 ? (
        /* ────────────────── STEP 1: CONTACT SYNC & REVIEW ────────────────── */
        <div className="space-y-6 animate-fade-in">
          {/* Sync controls */}
          <div className="bg-[#121420]/40 border border-white/5 p-4 rounded-2xl backdrop-blur-md shadow-xl relative overflow-hidden">
            {/* Subtle glow background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-1">
                {/* SharePoint List selector */}
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-gray-400 tracking-wider uppercase whitespace-nowrap">SharePoint List:</label>
                  <div className="relative w-44">
                    <select
                      id="sp-list-select"
                      value={selectedConfigId}
                      onChange={(e) => { setSelectedConfigId(e.target.value); setContacts([]); }}
                      disabled={loadingConfigs}
                      className="w-full bg-[#161a2b]/95 border border-indigo-500/35 hover:border-indigo-500/55 hover:bg-[#1e243d] rounded-xl px-3 py-1.5 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none pr-8 cursor-pointer h-[36px] shadow-md shadow-black/20"
                    >
                      {loadingConfigs ? (
                        <option value="" className="bg-[#161a2b] text-gray-400">Loading lists…</option>
                      ) : spConfigs.length === 0 ? (
                        <option value="" className="bg-[#161a2b] text-gray-400">No lists</option>
                      ) : (
                        spConfigs.map((cfg) => (
                          <option key={cfg.id} value={cfg.id} className="bg-[#161a2b] text-white">{cfg.name}</option>
                        ))
                      )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  {spConfigs.length === 0 && !loadingConfigs && (
                    <button
                      onClick={() => navigate('/settings/sharepoint')}
                      className="text-xs text-brand-400 hover:text-brand-300 underline whitespace-nowrap"
                    >
                      + Add
                    </button>
                  )}
                </div>

                {/* Sync Mode selector */}
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-gray-400 tracking-wider uppercase whitespace-nowrap">Sync Mode:</label>
                  <div className="relative w-52">
                    <select
                      id="sync-mode-select"
                      value={syncMode}
                      onChange={(e) => setSyncMode(e.target.value as 'incremental' | 'full')}
                      className="w-full bg-[#161a2b]/95 border border-indigo-500/35 hover:border-indigo-500/55 hover:bg-[#1e243d] rounded-xl px-3 py-1.5 text-white text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none pr-8 cursor-pointer h-[36px] shadow-md shadow-black/20"
                    >
                      <option value="incremental" className="bg-[#161a2b] text-white">Incremental Sync (Updates)</option>
                      <option value="full" className="bg-[#161a2b] text-white">Full Sync (All Contacts)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sync button */}
              <div className="shrink-0 w-full lg:w-auto">
                <button
                  id="sync-sharepoint-btn"
                  onClick={handleSync}
                  disabled={syncing || !selectedConfigId}
                  className="w-full lg:w-auto bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 h-[36px] px-5 rounded-2xl shadow-lg shadow-brand-500/10 hover:shadow-brand-500/20 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync from SharePoint'}
                </button>
              </div>
            </div>
          </div>

          {/* Stats row */}
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-3 animate-fade-in">
              <StatPill icon={<Users className="w-4 h-4" />} label="Total" value={stats.total} color="text-white" />
              <StatPill icon={<CheckCircle className="w-4 h-4" />} label="Valid" value={stats.validCount} color="text-emerald-400" />
              <StatPill icon={<XCircle className="w-4 h-4" />} label="Invalid" value={stats.invalidCount} color="text-red-400" />
              <StatPill icon={<MinusCircle className="w-4 h-4" />} label="Duplicates" value={stats.duplicateCount} color="text-amber-400" />
              <StatPill icon={<AlertCircle className="w-4 h-4" />} label="Unsubscribed" value={stats.unsubscribedCount} color="text-gray-400" />
            </div>
          )}

          {/* Contacts table preview */}
          <div className="glass-card p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <h2 className="section-title flex items-center gap-2">
                <Mail className="w-4 h-4 text-brand-400" />
                Contacts Preview
              </h2>
              {contacts.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Search Input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 pl-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 w-full sm:w-56"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Filter:</label>
                    <select
                      id="contact-filter-select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as any)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="all" className="bg-gray-900">All ({stats.total})</option>
                      <option value="valid" className="bg-gray-900">Valid ({stats.validCount})</option>
                      <option value="invalid" className="bg-gray-900">Invalid ({stats.invalidCount})</option>
                      <option value="duplicate" className="bg-gray-900">Duplicate ({stats.duplicateCount})</option>
                      <option value="unsubscribed" className="bg-gray-900">Unsubscribed ({stats.unsubscribedCount})</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {syncing ? (
              <div className="space-y-3 animate-pulse py-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/5 rounded-lg" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <Users className="w-14 h-14 mx-auto text-gray-700 mb-4" />
                <p className="text-sm font-semibold text-gray-400">No contacts synced yet</p>
                <p className="text-xs mt-1">Select your sync mode and click "Sync from SharePoint" above to fetch records.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[700px]">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="px-4 py-3 w-16">#</th>
                        <th className="px-4 py-3 w-[25%]">Name</th>
                        <th className="px-4 py-3 w-[40%]">Email</th>
                        <th className="px-4 py-3 w-[20%]">Status</th>
                        <th className="px-4 py-3 w-28 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm text-gray-300">
                      {visibleContacts.map((c, idx) => {
                        const actualIndex = contacts.findIndex(item => item === c);
                        const isEditing = editingIndex === actualIndex;

                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors group">
                            <td className="px-4 py-3 text-gray-600 text-xs">{actualIndex + 1}</td>
                            <td className="px-4 py-3 font-medium text-white truncate" title={c.name}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-white text-xs w-full focus:outline-none focus:border-brand-500"
                                />
                              ) : (
                                c.name || '—'
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs truncate" title={c.email}>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-white text-xs w-full focus:outline-none focus:border-brand-500"
                                />
                              ) : (
                                <span className={c.status === 'invalid' ? 'text-red-400 font-bold' : 'text-gray-400'}>{c.email}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5">
                                {statusIcon(c.status)}
                                <span className="capitalize text-xs">{c.status}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => saveEdit(actualIndex)}
                                    className="text-xs text-brand-400 hover:text-brand-300 font-semibold px-2.5 py-1 hover:bg-white/15 rounded-lg border border-brand-500/20"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="text-xs text-gray-400 hover:text-gray-200 px-2.5 py-1 hover:bg-white/10 rounded-lg border border-white/10"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => startEdit(actualIndex, c.name, c.email)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-brand-400 transition-all"
                                    title="Edit contact"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteContact(actualIndex)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                                    title="Delete contact"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredTotal > 20 && (
                  <div className="pt-3 text-center border-t border-white/5 mt-2">
                    <button
                      onClick={() => setShowAllContacts(!showAllContacts)}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mx-auto transition-colors"
                    >
                      {showAllContacts ? (
                        <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                      ) : (
                        <><ChevronDown className="w-3.5 h-3.5" /> Show all {filteredTotal} contacts</>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Wizard navigation bar */}
          {contacts.length > 0 && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={stats.validCount === 0}
                className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold shadow-lg shadow-brand-500/20 transition-all hover:translate-x-0.5"
              >
                Next: Setup Campaign
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Campaign History is kept at bottom of Step 1 */}
          <div className="glass-card p-6 overflow-hidden">
            <h2 className="section-title flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-brand-400" />
              Campaign History
            </h2>

            {loadingHistory ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/5 rounded-lg" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Layers className="w-12 h-12 mx-auto text-gray-700 mb-3" />
                <p className="text-sm">No campaigns yet. Launch your first one above!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Template</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Sent</th>
                      <th className="px-4 py-3 text-center">Failed</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-gray-300">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white max-w-[180px] truncate" title={c.name}>{c.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(c.createdAt).toLocaleDateString()}{' '}
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{c.template?.name || '—'}</td>
                        <td className="px-4 py-3 text-center font-semibold">{c.totalCount}</td>
                        <td className="px-4 py-3 text-center text-emerald-400 font-semibold">{c.sentCount}</td>
                        <td className="px-4 py-3 text-center text-red-400 font-semibold">{c.failedCount}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/campaigns/${c.id}`)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 hover:text-brand-400 text-gray-400 transition-all inline-flex items-center gap-1 text-xs"
                              title="View Campaign"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => setDeletingCampaign(c)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-400 transition-all inline-flex items-center"
                              title="Delete Campaign"
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
      ) : (
        /* ────────────────── STEP 2: CAMPAIGN CONFIGURATION ────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          {/* Setup Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-card p-6 space-y-5">
              <h2 className="section-title flex items-center gap-2">
                <Send className="w-4 h-4 text-brand-400" />
                Launch Details
              </h2>

              {/* Campaign name */}
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Campaign Name (optional)</label>
                <input
                  id="campaign-name-input"
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={`Campaign – ${new Date().toLocaleDateString()}`}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Template selector */}
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Email Template *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      id="template-select"
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-500 transition-colors appearance-none pr-10"
                    >
                      <option value="" className="bg-gray-900">Select a template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id} className="bg-gray-900">{t.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                  {selectedTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        setIframeHeight('400px');
                        setIsPreviewModalOpen(true);
                      }}
                      className="px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-brand-500/20 hover:text-brand-400 text-gray-300 transition-all flex items-center justify-center shrink-0"
                      title="Preview Email Format"
                    >
                      <Eye className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
                {templates.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    No templates yet.{' '}
                    <a href="/templates/create" className="underline hover:text-amber-300">Create one</a>
                  </p>
                )}
              </div>

              {/* Validation summary */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-xs text-emerald-300 space-y-1">
                <p><strong>{stats.validCount}</strong> valid contacts will receive this email.</p>
                {stats.unsubscribedCount > 0 && (
                  <p className="text-gray-400">{stats.unsubscribedCount} unsubscribed contacts will be skipped.</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  id="start-campaign-btn"
                  onClick={handleStartCampaign}
                  disabled={sending || !selectedTemplate}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed py-3 text-sm font-semibold rounded-xl"
                >
                  {sending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start Campaign
                    </>
                  )}
                </button>
                <button
                  onClick={() => setStep(1)}
                  disabled={sending}
                  className="w-full border border-white/10 bg-transparent hover:bg-white/5 text-gray-300 font-semibold py-2.5 text-sm rounded-xl transition-all"
                >
                  Back to Contacts
                </button>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-white mb-3">Email Contents Preview</h3>
              {selectedTemplateObj ? (
                <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5 p-4">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Subject: <span className="text-white font-mono">{selectedTemplateObj.subject}</span></p>
                  <hr className="border-white/10 my-3" />
                  <div className="text-xs text-gray-300 bg-black/30 p-1 rounded-lg overflow-y-auto max-h-[400px] border border-white/5">
                    <iframe
                      srcDoc={selectedTemplateObj.htmlBody}
                      title="Template Preview"
                      className="w-full border-none bg-white rounded"
                      style={{ height: '350px' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500 border border-dashed border-white/10 rounded-xl">
                  <Mail className="w-12 h-12 mx-auto text-gray-700 mb-3" />
                  <p className="text-sm font-semibold text-gray-400">No template selected yet</p>
                  <p className="text-xs mt-1">Select a template on the left panel to preview email content here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Template Modal */}
      {isPreviewModalOpen && selectedTemplateObj && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-white/10 flex flex-col max-h-[90vh]">
            <button
              onClick={() => setIsPreviewModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-400" />
                Email Template Preview
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Visualizing actual send format for template: <span className="font-semibold text-white">{selectedTemplateObj.name}</span>
              </p>
            </div>

            {/* Email client container mock */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950 flex flex-col flex-1 min-h-[400px]">
              {/* Email Client Header */}
              <div className="bg-white/5 p-4 border-b border-white/10 space-y-2 text-xs text-gray-300">
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-white font-medium text-sm">{selectedTemplateObj.subject}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">From:</span>
                  <span>Vishv Umiya Foundation (VUF) &lt;{senderEmail}&gt;</span>
                </div>
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">To:</span>
                  <span>Recipient &lt;recipient@example.com&gt;</span>
                </div>
              </div>

              {/* Email Content Frame */}
              <div className="flex-1 bg-slate-900/50 overflow-y-auto p-4 md:p-6 flex justify-center">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-[650px] overflow-hidden self-start">
                  <iframe
                    title="Template Html Preview"
                    onLoad={handleIframeLoad}
                    style={{ height: iframeHeight }}
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta charset="utf-8">
                          <style>
                            body {
                              font-family: 'Inter', system-ui, -apple-system, sans-serif;
                              color: #1e293b;
                              line-height: 1.6;
                              background-color: #ffffff;
                              margin: 0;
                              padding: 0;
                            }
                            ::-webkit-scrollbar {
                              width: 6px;
                              height: 6px;
                            }
                            ::-webkit-scrollbar-track {
                              background: #f1f5f9;
                            }
                            ::-webkit-scrollbar-thumb {
                              background: #cbd5e1;
                              border-radius: 3px;
                            }
                          </style>
                        </head>
                        <body>
                          ${selectedTemplateObj.htmlBody
                        .replace(/\{\{\s*name\s*\}\}/g, 'Recipient')
                        .replace(/\{\{\s*email\s*\}\}/g, 'recipient@example.com')
                        .replace(/\{\{\s*unsubscribeLink\s*\}\}/g, '#')
                      }
                        </body>
                      </html>
                    `}
                    className="w-full border-0 block"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="btn-secondary text-sm py-2 px-6"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletingCampaign && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-500/20 bg-red-950/20 animate-fade-in">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Delete Campaign?
              </h3>
              <button onClick={() => setDeletingCampaign(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              Are you sure you want to delete{' '}
              <strong className="text-white">"{deletingCampaign.name}"</strong>? This will permanently
              delete the campaign and all its recipient records. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingCampaign(null)} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleDeleteCampaign}
                className="bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs px-4 py-2 font-medium transition-all"
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
