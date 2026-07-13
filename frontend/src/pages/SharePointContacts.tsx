import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Play, Eye, ChevronDown, ChevronUp, ChevronRight, Edit,
  CheckCircle, AlertCircle, XCircle, MinusCircle,
  Users, Mail, Send, History, Trash2, X, AlertTriangle,
  Calendar, Layers, Search, SlidersHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadApi } from '../api/upload.api';
import { Template, Campaign, SPContact, SharePointConfig } from '../types';
import StatusBadge from '../components/StatusBadge';

// Filter out internal system columns from SharePoint lists by default
const SYSTEM_COLUMNS = new Set([
  'id', 'ContentType', 'Attachments', 'Modified', 'Created', 
  'AuthorLookupId', 'EditorLookupId', 'OData__ColorTag',
  'odata.etag', 'odata.type', 'ComplianceAssetId',
  'Author', 'Editor',
  // Additional internal SharePoint system metadata columns
  '@odata.etag', '_UIVersionString', '_HasCopyDestinations', '_CopySource',
  'Edit', 'LinkFilename', 'LinkFilenameNoMenu', 'LinkTitle', 'LinkTitleNoMenu',
  'ItemChildCount', 'FolderChildCount', '_ComplianceFlags', '_ComplianceTag',
  '_ComplianceTagWrittenTime', '_ComplianceTagUserId', 'AppEditorLookupId',
  'AppAuthorLookupId', 'DocIcon', 'HTML_x0020_File_x0020_Type', 'FSObjType',
  'Created_x0020_Date', 'Last_x0020_Modified', 'LookupId', 'FileRef',
  'FileDirRef', 'FileLeafRef', 'UniqueId', 'ProgId', 'ScopeId', 'Order',
  'GUID', 'MetaInfo', 'MediaServiceImageTags', 'FirstUniqueAncestorSecurable'
]);

const NAME_CANDIDATES = new Set(['name', 'title', 'contactname', 'fullname', 'firstname']);
const EMAIL_CANDIDATES = new Set(['email', 'emailaddress', 'workemail', 'email_x0020_address', 'work_x0020_email']);

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [rangeFrom, setRangeFrom] = useState<string>('1');
  const [rangeTo, setRangeTo] = useState<string>('');

  const selectedValidCount = contacts.filter(
    (c) => c.status === 'valid' && c.itemId && selectedItemIds.has(c.itemId)
  ).length;

  const handleApplyRange = (isCumulative: boolean) => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);

    if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
      toast.error('Please enter a valid range (From must be <= To, and both >= 1)');
      return;
    }

    if (to > contacts.length) {
      toast.error(`Range upper bound cannot exceed total contacts count (${contacts.length})`);
      return;
    }

    const rangeValidIds: string[] = [];
    contacts.forEach((c, idx) => {
      const rowNum = idx + 1;
      if (rowNum >= from && rowNum <= to && c.status === 'valid' && c.itemId) {
        rangeValidIds.push(c.itemId);
      }
    });

    setSelectedItemIds((prev) => {
      const next = isCumulative ? new Set(prev) : new Set<string>();
      rangeValidIds.forEach(id => next.add(id));
      return next;
    });

    toast.success(
      isCumulative
        ? `Added range ${from}-${to} (${rangeValidIds.length} valid contacts added)`
        : `Selected range ${from}-${to} (${rangeValidIds.length} valid contacts selected)`
    );
  };

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

  // ── Dynamic Column states ──
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const [mappedNameField, setMappedNameField] = useState<string>('');
  const [mappedEmailField, setMappedEmailField] = useState<string>('');

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

  const toggleColumn = (colName: string) => {
    if (selectedColumns.includes(colName)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== colName));
    } else {
      setSelectedColumns([...selectedColumns, colName]);
    }
  };

  const applyFieldMapping = (
    contactsList: SPContact[],
    nameField: string,
    emailField: string,
    unsubSet: Set<string>
  ) => {
    const remapped = contactsList.map(c => ({
      ...c,
      name: c.rawFields?.[nameField] ? String(c.rawFields[nameField]).trim() : '',
      email: c.rawFields?.[emailField] ? String(c.rawFields[emailField]).trim().toLowerCase() : '',
    }));
    return recalculateContactsList(remapped, unsubSet);
  };

  const handleNameMappingChange = (nameField: string) => {
    setMappedNameField(nameField);
    if (!nameField || !mappedEmailField) return;
    const result = applyFieldMapping(contacts, nameField, mappedEmailField, unsubscribedEmails);
    setContacts(result.contacts);
    setStats(result.stats);
  };

  const handleEmailMappingChange = (emailField: string) => {
    setMappedEmailField(emailField);
    if (!mappedNameField || !emailField) return;
    const result = applyFieldMapping(contacts, mappedNameField, emailField, unsubscribedEmails);
    setContacts(result.contacts);
    setStats(result.stats);
  };

  // ── Sync from SharePoint ──
  const handleSync = useCallback(async () => {
    if (!selectedConfigId) {
      toast.error('Please select a SharePoint list first');
      return;
    }
    if (!selectedTemplate) {
      toast.error('Please select an email template first');
      return;
    }
    setSyncing(true);
    setContacts([]);
    try {
      const res = await uploadApi.getSharePointContacts(selectedConfigId, syncMode, selectedTemplate);
      const syncedContacts = res.data.contacts || [];

      // Track unsubscribed email list locally for inline edits validation
      const unsubs = new Set(
        syncedContacts
          .filter((c: SPContact) => c.status === 'unsubscribed')
          .map((c: SPContact) => c.email.toLowerCase())
      );
      setUnsubscribedEmails(unsubs);

      // Extract unique columns from rawFields, skipping system columns
      const cols = new Set<string>();
      syncedContacts.forEach((c) => {
        if (c.rawFields) {
          Object.keys(c.rawFields).forEach((key) => {
            if (!SYSTEM_COLUMNS.has(key)) {
              cols.add(key);
            }
          });
        }
      });
      const allCols = Array.from(cols);
      setAvailableColumns(allCols);
      setSelectedColumns(allCols);

      // Auto-detect Name and Email fields from available columns
      let nameFieldDetected = '';
      let emailFieldDetected = '';
      for (const col of allCols) {
        const lowerCol = col.toLowerCase();
        if (!nameFieldDetected && NAME_CANDIDATES.has(lowerCol)) {
          nameFieldDetected = col;
        }
        if (!emailFieldDetected && EMAIL_CANDIDATES.has(lowerCol)) {
          emailFieldDetected = col;
        }
      }
      // Fallback defaults
      if (!nameFieldDetected) {
        nameFieldDetected = allCols.find(c => c.toLowerCase() === 'title' || c.toLowerCase() === 'name') || allCols[0] || '';
      }
      if (!emailFieldDetected) {
        emailFieldDetected = allCols.find(c => c.toLowerCase() === 'email' || c.toLowerCase() === 'emailaddress') || allCols[0] || '';
      }
      setMappedNameField(nameFieldDetected);
      setMappedEmailField(emailFieldDetected);

      // Apply initial mapping and validation
      const result = applyFieldMapping(syncedContacts, nameFieldDetected, emailFieldDetected, unsubs);
      setContacts(result.contacts);
      setStats(result.stats);

      // Auto-select all valid contacts by default
      const initialSelected = new Set(
        result.contacts
          .filter((c) => c.status === 'valid' && c.itemId)
          .map((c) => c.itemId as string)
      );
      setSelectedItemIds(initialSelected);
      setRangeFrom('1');
      setRangeTo(String(result.contacts.length));

      setStep(1); // Reset to step 1 on new sync
      const selectedConfig = spConfigs.find((c) => c.id === selectedConfigId);
      toast.success(`Synced ${res.data.total} contacts from "${selectedConfig?.name || 'SharePoint'}" (${syncMode} mode)`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sync from SharePoint');
    } finally {
      setSyncing(false);
    }
  }, [syncMode, selectedConfigId, selectedTemplate, spConfigs]);

  // ── Create Campaign & Send ──
  const handleStartCampaign = async () => {
    if (!selectedTemplate) {
      toast.error('Please select an email template');
      return;
    }
    if (selectedValidCount === 0) {
      toast.error('No selected valid contacts to send to.');
      return;
    }
    setSending(true);
    try {
      const res = await uploadApi.createCampaign({
        name: campaignName || `Campaign – ${new Date().toLocaleDateString()}`,
        templateId: selectedTemplate,
        syncMode: syncMode,
        configId: selectedConfigId || undefined,
        contacts: contacts
          .filter(c => c.itemId && selectedItemIds.has(c.itemId))
          .map(c => ({ name: c.name, email: c.email, itemId: c.itemId })),
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
    rawContacts: SPContact[],
    unsubSet: Set<string>
  ) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set<string>();

    let validCount = 0, invalidCount = 0, duplicateCount = 0, unsubscribedCount = 0;

    const contactsList: SPContact[] = rawContacts.map((c) => {
      const email = c.email.toLowerCase().trim();
      const name = c.name.trim();
      const itemId = c.itemId;
      const rawFields = c.rawFields;

      if (!email || !emailRegex.test(email)) {
        invalidCount++;
        return { name, email, status: 'invalid', reason: 'Invalid email format', itemId, rawFields };
      }
      if (seenEmails.has(email)) {
        duplicateCount++;
        return { name, email, status: 'duplicate', reason: 'Duplicate email in list', itemId, rawFields };
      }
      seenEmails.add(email);
      if (unsubSet.has(email)) {
        unsubscribedCount++;
        return { name, email, status: 'unsubscribed', reason: 'Email is unsubscribed', itemId, rawFields };
      }
      validCount++;
      return { name, email, status: 'valid', reason: null, itemId, rawFields };
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
        const rf = c.rawFields ? { ...c.rawFields } : undefined;
        if (rf) {
          Object.keys(rf).forEach((k) => {
            const lk = k.toLowerCase();
            if (NAME_CANDIDATES.has(lk)) rf[k] = editName;
            if (EMAIL_CANDIDATES.has(lk)) rf[k] = editEmail;
          });
        }
        return { ...c, name: editName, email: editEmail, rawFields: rf };
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
    const contactToDelete = contacts[index];
    const updatedRaw = contacts.filter((_, idx) => idx !== index);
    const recalculated = recalculateContactsList(updatedRaw, unsubscribedEmails);
    setContacts(recalculated.contacts);
    setStats(recalculated.stats);

    if (contactToDelete?.itemId) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(contactToDelete.itemId!);
        return next;
      });
    }

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

  const visibleValidContacts = visibleContacts.filter(c => c.status === 'valid');
  const isAllVisibleSelected = visibleValidContacts.length > 0 && visibleValidContacts.every(c => c.itemId && selectedItemIds.has(c.itemId));
  const isSomeVisibleSelected = visibleValidContacts.length > 0 && visibleValidContacts.some(c => c.itemId && selectedItemIds.has(c.itemId));

  const handleToggleAllVisible = () => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (isAllVisibleSelected) {
        visibleValidContacts.forEach(c => {
          if (c.itemId) next.delete(c.itemId);
        });
      } else {
        visibleValidContacts.forEach(c => {
          if (c.itemId) next.add(c.itemId);
        });
      }
      return next;
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'valid': return <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
      case 'invalid': return <XCircle className="w-3.5 h-3.5 text-red-650 text-red-650 text-red-605 text-red-600" />;
      case 'duplicate': return <MinusCircle className="w-3.5 h-3.5 text-amber-600" />;
      case 'unsubscribed': return <AlertCircle className="w-3.5 h-3.5 text-gray-500" />;
      default: return null;
    }
  };

  const filteredTotal = contacts.filter((c) => filterStatus === 'all' || c.status === filterStatus).length;

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="space-y-8">
      {/* Wizard Steps indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="page-title">SharePoint Contacts Wizard</h1>
          <p className="text-gray-500 mt-1">
            {step === 1
              ? 'Step 1: Fetch contacts and customize/clean the mailing list'
              : 'Step 2: Assign campaign details, preview template, and launch'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${step === 1 ? 'bg-brand-50 text-brand-600 border border-brand-200 shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center text-[10px] text-brand-700">1</span>
            Contacts list ({stats.validCount} valid)
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${step === 2 ? 'bg-brand-50 text-brand-600 border border-brand-200 shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center text-[10px] text-brand-700">2</span>
            Campaign Launch
          </div>
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-6 animate-fade-in">
          {/* Sync controls */}
          <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm relative overflow-hidden">
            {/* Subtle glow background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 lg:gap-6 flex-1">
                {/* SharePoint List selector */}
                <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
                  <label className="text-[10px] font-bold text-gray-500 tracking-wider uppercase whitespace-nowrap">SharePoint List</label>
                  <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-44">
                      <select
                        id="sp-list-select"
                        value={selectedConfigId}
                        onChange={(e) => { setSelectedConfigId(e.target.value); setContacts([]); setAvailableColumns([]); setSelectedColumns([]); setMappedNameField(''); setMappedEmailField(''); }}
                        disabled={loadingConfigs}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-1.5 pr-8 text-gray-900 text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer h-[36px] shadow-sm"
                      >
                        {loadingConfigs ? (
                          <option value="">Loading lists…</option>
                        ) : spConfigs.length === 0 ? (
                          <option value="">No lists</option>
                        ) : (
                          spConfigs.map((cfg) => (
                            <option key={cfg.id} value={cfg.id}>{cfg.name}</option>
                          ))
                        )}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    {spConfigs.length === 0 && !loadingConfigs && (
                      <button
                        onClick={() => navigate('/settings/sharepoint')}
                        className="text-xs text-brand-600 hover:text-brand-700 font-semibold underline whitespace-nowrap"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>

                {/* Email Template Selector */}
                <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
                  <label className="text-[10px] font-bold text-gray-500 tracking-wider uppercase whitespace-nowrap">Email Template</label>
                  <div className="relative w-full sm:w-44">
                    <select
                      id="sp-template-select"
                      value={selectedTemplate}
                      onChange={(e) => { setSelectedTemplate(e.target.value); setContacts([]); }}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-1.5 pr-8 text-gray-900 text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer h-[36px] shadow-sm"
                    >
                      <option value="">Select a template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Sync Mode selector */}
                <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
                  <label className="text-[10px] font-bold text-gray-500 tracking-wider uppercase whitespace-nowrap">Sync Mode</label>
                  <div className="relative w-full sm:w-56">
                    <select
                      id="sync-mode-select"
                      value={syncMode}
                      onChange={(e) => { setSyncMode(e.target.value as 'incremental' | 'full'); setContacts([]); }}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-1.5 pr-8 text-gray-900 text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer h-[36px] shadow-sm"
                    >
                      <option value="incremental">Incremental Sync (Updates)</option>
                      <option value="full">Full Sync (All Contacts)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
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
                  disabled={syncing || !selectedConfigId || !selectedTemplate}
                  className="w-full lg:w-auto bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 h-[36px] px-5 rounded-xl shadow-sm active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync from SharePoint'}
                </button>
              </div>
            </div>

            {availableColumns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4 animate-fade-in">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Column Mapping:</div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Map Name To</label>
                  <div className="relative w-44">
                    <select
                      value={mappedNameField}
                      onChange={(e) => handleNameMappingChange(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl px-2.5 py-1 pr-7 text-gray-900 text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer h-[32px] shadow-sm"
                    >
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col.replace(/_x0020_/g, ' ')}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                      <ChevronDown className="w-3 h-3" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Map Email To</label>
                  <div className="relative w-44">
                    <select
                      value={mappedEmailField}
                      onChange={(e) => handleEmailMappingChange(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl px-2.5 py-1 pr-7 text-gray-900 text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all appearance-none cursor-pointer h-[32px] shadow-sm"
                    >
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col.replace(/_x0020_/g, ' ')}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                      <ChevronDown className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          {contacts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in">
              <div className="flex flex-wrap gap-3">
                <StatPill icon={<Users className="w-4 h-4" />} label="Total" value={stats.total} color="text-gray-900" />
                <StatPill icon={<Mail className="w-4 h-4" />} label="Selected (to Send)" value={selectedValidCount} color="text-brand-600" />
                <StatPill icon={<CheckCircle className="w-4 h-4" />} label="Valid" value={stats.validCount} color="text-emerald-600" />
                <StatPill icon={<XCircle className="w-4 h-4" />} label="Invalid" value={stats.invalidCount} color="text-red-600" />
                <StatPill icon={<MinusCircle className="w-4 h-4" />} label="Duplicates" value={stats.duplicateCount} color="text-amber-600" />
                <StatPill icon={<AlertCircle className="w-4 h-4" />} label="Unsubscribed" value={stats.unsubscribedCount} color="text-gray-500" />
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-200 shadow-sm">
                {/* Bulk toggles */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allValid = new Set(contacts.filter(c => c.status === 'valid' && c.itemId).map(c => c.itemId!));
                      setSelectedItemIds(allValid);
                      toast.success(`Selected all ${allValid.size} valid contacts`);
                    }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-bold transition-colors"
                  >
                    Select All Valid
                  </button>
                  <span className="text-gray-300 font-normal">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItemIds(new Set());
                      toast.success('Cleared all selections');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-600 font-bold transition-colors"
                  >
                    Clear Selection
                  </button>
                </div>

                <span className="hidden lg:inline text-gray-300">|</span>

                {/* Range Select Controls */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-gray-500 font-medium">Select Range:</span>
                  <input
                    type="number"
                    min="1"
                    max={contacts.length}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-center font-semibold text-gray-800 focus:outline-none focus:border-brand-500 shadow-sm"
                    placeholder="From"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="number"
                    min="1"
                    max={contacts.length}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-center font-semibold text-gray-800 focus:outline-none focus:border-brand-500 shadow-sm"
                    placeholder="To"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyRange(false)}
                    className="bg-brand-100 hover:bg-brand-200 text-brand-700 font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm cursor-pointer"
                    title="Set selection to this range"
                  >
                    Set Range
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyRange(true)}
                    className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold px-2.5 py-1 rounded-lg transition-colors shadow-sm cursor-pointer"
                    title="Add this range of records to current selection"
                  >
                    Add Range
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contacts table preview */}
          <div className="glass-card p-6 overflow-hidden bg-white border border-gray-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <h2 className="section-title flex items-center gap-2">
                <Mail className="w-4 h-4 text-brand-600" />
                Contacts Preview
              </h2>
              {contacts.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-56">
                    <input
                      type="text"
                      placeholder="Search name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 pl-8 text-xs text-gray-950 placeholder-gray-400 focus:outline-none focus:border-brand-500 w-full"
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

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Filter:</label>
                    <select
                      id="contact-filter-select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as any)}
                      className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-brand-500 shadow-sm h-[28px]"
                    >
                      <option value="all">All ({stats.total})</option>
                      <option value="valid">Valid ({stats.validCount})</option>
                      <option value="invalid">Invalid ({stats.invalidCount})</option>
                      <option value="duplicate">Duplicate ({stats.duplicateCount})</option>
                      <option value="unsubscribed">Unsubscribed ({stats.unsubscribedCount})</option>
                    </select>
                  </div>

                  {/* Column Picker */}
                  {availableColumns.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                        className="flex items-center gap-1.5 bg-white border border-gray-300 hover:border-gray-400 rounded-lg px-3 py-1.5 text-xs text-gray-700 font-semibold shadow-sm transition-all focus:outline-none h-[28px] select-none"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Columns
                        {selectedColumns.length !== availableColumns.length && (
                          <span className="bg-brand-100 text-brand-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {selectedColumns.length}/{availableColumns.length}
                          </span>
                        )}
                      </button>

                      {isColumnDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setIsColumnDropdownOpen(false)} 
                          />
                          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-xl z-20 p-3 max-h-72 overflow-y-auto space-y-2 animate-scale-in">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1">
                              <span className="text-xs font-bold text-gray-700">Show Columns</span>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setSelectedColumns(availableColumns)}
                                  className="text-[10px] text-brand-600 hover:text-brand-700 font-bold hover:underline"
                                >
                                  All
                                </button>
                                <button 
                                  onClick={() => setSelectedColumns([])}
                                  className="text-[10px] text-gray-500 hover:text-gray-600 font-bold hover:underline"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {availableColumns.map((colName) => {
                                const isChecked = selectedColumns.includes(colName);
                                return (
                                  <label 
                                    key={colName} 
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs text-gray-700 select-none"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleColumn(colName)}
                                      className="rounded text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer border-gray-300"
                                    />
                                    <span className="truncate" title={colName}>
                                      {colName.replace(/_x0020_/g, ' ')}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {syncing ? (
              <div className="space-y-3 animate-pulse py-6">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                <p className="text-sm font-semibold text-gray-700">No contacts synced yet</p>
                <p className="text-xs text-gray-500 mt-1">Select your sync mode and click "Sync from SharePoint" above to fetch records.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full table-fixed min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                        <th className="px-4 py-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isAllVisibleSelected}
                            ref={input => {
                              if (input) {
                                input.indeterminate = isSomeVisibleSelected && !isAllVisibleSelected;
                              }
                            }}
                            onChange={handleToggleAllVisible}
                            className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer border-gray-300"
                          />
                        </th>
                        <th className="px-4 py-3 w-14">#</th>
                        {selectedColumns.map((colName) => {
                          let widthClass = "w-48";
                          const isNameField = colName === mappedNameField;
                          const isEmailField = colName === mappedEmailField;

                          if (isNameField) {
                            widthClass = "w-48";
                          } else if (isEmailField) {
                            widthClass = "w-60";
                          }
                          return (
                            <th key={colName} className={`px-4 py-3 ${widthClass} uppercase truncate`} title={colName.replace(/_x0020_/g, ' ')}>
                              <div className="flex items-center gap-1.5">
                                <span>{colName.replace(/_x0020_/g, ' ')}</span>
                                {isNameField && (
                                  <span className="bg-brand-50 text-brand-600 text-[9px] px-1.5 py-0.5 rounded-md font-bold lowercase first-letter:uppercase">
                                    Name
                                  </span>
                                )}
                                {isEmailField && (
                                  <span className="bg-emerald-50 text-emerald-600 text-[9px] px-1.5 py-0.5 rounded-md font-bold lowercase first-letter:uppercase">
                                    Email
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-4 py-3 w-32">Status</th>
                        <th className="px-4 py-3 w-28 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {visibleContacts.map((c, idx) => {
                        const actualIndex = contacts.findIndex(item => item === c);
                        const isEditing = editingIndex === actualIndex;

                        return (
                          <tr key={idx} className="hover:bg-gray-50/40 transition-colors group">
                            <td className="px-4 py-3 text-center w-10">
                              <input
                                type="checkbox"
                                checked={c.itemId ? selectedItemIds.has(c.itemId) : false}
                                disabled={c.status !== 'valid'}
                                onChange={() => {
                                  if (!c.itemId) return;
                                  setSelectedItemIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(c.itemId!)) {
                                      next.delete(c.itemId!);
                                    } else {
                                      next.add(c.itemId!);
                                    }
                                    return next;
                                  });
                                }}
                                className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{actualIndex + 1}</td>
                            {selectedColumns.map((colName) => {
                              const isNameField = colName === mappedNameField;
                              const isEmailField = colName === mappedEmailField;

                              if (isNameField) {
                                return (
                                  <td key={colName} className="px-4 py-3 font-medium text-gray-900 truncate" title={c.name}>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-gray-950 text-xs w-full focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
                                      />
                                    ) : (
                                      c.name || '—'
                                    )}
                                  </td>
                                );
                              }

                              if (isEmailField) {
                                return (
                                  <td key={colName} className="px-4 py-3 font-mono text-xs truncate" title={c.email}>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editEmail}
                                        onChange={(e) => setEditEmail(e.target.value)}
                                        className="bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-gray-950 text-xs w-full focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
                                      />
                                    ) : (
                                      <span className={c.status === 'invalid' ? 'text-red-600 font-bold' : 'text-gray-500'}>{c.email}</span>
                                    )}
                                  </td>
                                );
                              }

                              const val = c.rawFields?.[colName];
                              let displayVal = '—';
                              if (val !== undefined && val !== null) {
                                if (typeof val === 'object') {
                                  displayVal = JSON.stringify(val);
                                } else {
                                  displayVal = String(val);
                                }
                              }
                              return (
                                <td key={colName} className="px-4 py-3 text-xs text-gray-500 truncate" title={displayVal}>
                                  {displayVal}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5">
                                {statusIcon(c.status)}
                                <span className="capitalize text-xs font-medium">{c.status}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => saveEdit(actualIndex)}
                                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold px-2.5 py-1 hover:bg-brand-50 rounded-lg border border-brand-200"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1 hover:bg-gray-50 rounded-lg border border-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => startEdit(actualIndex, c.name, c.email)}
                                    className="p-1.5 hover:bg-gray-150 rounded-lg text-gray-500 hover:text-brand-600 transition-all hover:bg-gray-100"
                                    title="Edit contact"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteContact(actualIndex)}
                                    className="p-1.5 hover:bg-gray-150 rounded-lg text-gray-500 hover:text-red-600 transition-all hover:bg-gray-100"
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
                  <div className="pt-3 text-center border-t border-gray-100 mt-2">
                    <button
                      onClick={() => setShowAllContacts(!showAllContacts)}
                      className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 mx-auto font-semibold transition-colors"
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
                disabled={selectedValidCount === 0}
                className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold shadow-sm transition-all hover:translate-x-0.5"
              >
                Next: Setup Campaign
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Campaign History is kept at bottom of Step 1 */}
          <div className="glass-card p-6 overflow-hidden bg-white border border-gray-200 shadow-sm">
            <h2 className="section-title flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-brand-600" />
              Campaign History
            </h2>

            {loadingHistory ? (
              <div className="space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Layers className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-sm">No campaigns yet. Launch your first one above!</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">SharePoint List</th>
                      <th className="px-4 py-3">Template</th>
                      <th className="px-4 py-3">Sync Mode</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Sent</th>
                      <th className="px-4 py-3 text-center">Failed</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 max-w-[180px] truncate" title={c.name}>{c.name}</div>
                          <div className="text-xs text-gray-450 text-gray-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {new Date(c.createdAt).toLocaleDateString()}{' '}
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-medium">{c.config?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-medium">{c.template?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {c.syncMode === 'incremental' ? (
                            <span className="px-2 py-0.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 text-[10px] font-bold uppercase tracking-wider">
                              Incremental
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase tracking-wider">
                              Full Sync
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-800">{c.totalCount}</td>
                        <td className="px-4 py-3 text-center text-emerald-600 font-bold">{c.sentCount}</td>
                        <td className="px-4 py-3 text-center text-red-600 font-bold">{c.failedCount}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/campaigns/${c.id}`)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-brand-50 hover:text-brand-750 text-gray-700 transition-all inline-flex items-center gap-1 text-xs font-semibold shadow-sm"
                              title="View Campaign"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => setDeletingCampaign(c)}
                              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-red-50 hover:text-red-650 hover:text-red-600 text-gray-750 transition-all inline-flex items-center shadow-sm"
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
            <div className="glass-card p-6 space-y-5 bg-white border border-gray-200 shadow-sm">
              <h2 className="section-title flex items-center gap-2 border-b border-gray-150 border-gray-100 pb-3">
                <Send className="w-4 h-4 text-brand-600" />
                Launch Details
              </h2>

              {/* Campaign name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Campaign Name (optional)</label>
                <input
                  id="campaign-name-input"
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={`Campaign – ${new Date().toLocaleDateString()}`}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                />
              </div>

              {/* Selected Template (Read-Only in Step 2) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Email Template</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-700 text-sm flex items-center justify-between">
                    <span className="font-semibold text-brand-600">
                      {selectedTemplateObj?.name || 'No template selected'}
                    </span>
                  </div>
                  {selectedTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        setIframeHeight('400px');
                        setIsPreviewModalOpen(true);
                      }}
                      className="px-3 rounded-xl bg-white border border-gray-300 hover:bg-brand-50 hover:text-brand-600 text-gray-700 transition-all flex items-center justify-center shrink-0 shadow-sm"
                      title="Preview Email Format"
                    >
                      <Eye className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Validation summary */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800 space-y-1">
                <p className="font-semibold text-emerald-800">Ready to Launch!</p>
                <p><strong>{selectedValidCount}</strong> valid contacts (selected out of {stats.validCount}) will receive this email.</p>
                {stats.unsubscribedCount > 0 && (
                  <p className="text-gray-500">{stats.unsubscribedCount} unsubscribed contacts will be skipped.</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  id="start-campaign-btn"
                  onClick={handleStartCampaign}
                  disabled={sending || !selectedTemplate || selectedValidCount === 0}
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
                  className="btn-secondary w-full py-2.5"
                >
                  Back to Contacts
                </button>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card p-6 bg-white border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3 pb-3 border-b border-gray-100">Email Contents Preview</h3>
              {selectedTemplateObj ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50 p-4">
                  <p className="text-xs text-gray-500 mb-2 font-medium">Subject: <span className="text-gray-900 font-semibold font-mono">{selectedTemplateObj.subject}</span></p>
                  <hr className="border-gray-200 my-3" />
                  <div className="text-xs text-gray-700 bg-white p-1 rounded-lg overflow-y-auto max-h-[400px] border border-gray-200">
                    <iframe
                      srcDoc={selectedTemplateObj.htmlBody}
                      title="Template Preview"
                      className="w-full border-none bg-white rounded"
                      style={{ height: '350px' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400 border border-dashed border-gray-300 rounded-xl bg-gray-50/30">
                  <Mail className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-semibold text-gray-700">No template selected yet</p>
                  <p className="text-xs text-gray-500 mt-1">Select a template on the left panel to preview email content here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Template Modal */}
      {isPreviewModalOpen && selectedTemplateObj && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-gray-200 bg-white flex flex-col max-h-[90vh] shadow-2xl">
            <button
              onClick={() => setIsPreviewModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-600" />
                Email Template Preview
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Visualizing actual send format for template: <span className="font-semibold text-gray-800">{selectedTemplateObj.name}</span>
              </p>
            </div>

            {/* Email client container mock */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col flex-1 min-h-[400px] shadow-sm">
              {/* Email Client Header */}
              <div className="bg-gray-50 p-4 border-b border-gray-200 space-y-2 text-xs text-gray-600">
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-gray-900 font-bold text-sm">{selectedTemplateObj.subject}</span>
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
              <div className="flex-1 bg-gray-100 overflow-y-auto p-4 md:p-6 flex justify-center">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-full max-w-[650px] overflow-hidden self-start">
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
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-200 bg-white shadow-2xl">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-650 text-red-600" />
                Delete Campaign?
              </h3>
              <button onClick={() => setDeletingCampaign(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Are you sure you want to delete{' '}
              <strong className="text-gray-900 font-semibold">"{deletingCampaign.name}"</strong>? This will permanently
              delete the campaign and all its recipient records. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingCampaign(null)} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleDeleteCampaign}
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
