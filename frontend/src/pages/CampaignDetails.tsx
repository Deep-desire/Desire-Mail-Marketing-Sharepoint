import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Send,
  XCircle,
  Clock,
  Ban,
  Mail,
  Calendar,
  Eye,
  Edit,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import toast from 'react-hot-toast';
import ReportTable from '../components/ReportTable';
import StatusBadge from '../components/StatusBadge';
import StatsCard from '../components/StatsCard';
import { uploadApi } from '../api/upload.api';
import { Campaign, Recipient } from '../types';

const columnHelper = createColumnHelper<Recipient>();

export default function CampaignDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const shouldLaunch = searchParams.get('launch') === 'true';

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; active: boolean } | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'sent' | 'failed' | 'pending' | 'skipped'>('all');

  // ── Recipient detail & edit modals state ──
  const [viewRecipient, setViewRecipient] = useState<Recipient | null>(null);
  const [editRecipient, setEditRecipient] = useState<Recipient | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [deletingRecipient, setDeletingRecipient] = useState<Recipient | null>(null);
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html');
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredRecipients = useMemo(() => {
    if (selectedFilter === 'all') return recipients;
    return recipients.filter((r) => r.status === selectedFilter);
  }, [recipients, selectedFilter]);

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info) => <span className="font-medium text-white">{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'validation',
      header: 'Validation',
      cell: (info) => {
        const row = info.row.original;
        let valStatus: 'valid' | 'invalid' | 'duplicate' | 'unsubscribed' = 'valid';
        if (row.error === 'Invalid email format') valStatus = 'invalid';
        else if (row.error === 'Email is unsubscribed') valStatus = 'unsubscribed';

        let color = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        if (valStatus === 'invalid') color = 'bg-red-500/10 text-red-400 border border-red-500/20';
        if (valStatus === 'unsubscribed') color = 'bg-gray-500/10 text-gray-400 border border-gray-500/20';

        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}>
            <span className="capitalize">{valStatus}</span>
          </span>
        );
      }
    }),
    columnHelper.accessor('status', {
      header: 'Delivery Status',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('sentAt', {
      header: 'Sent At',
      cell: (info) => {
        const val = info.getValue();
        return val ? new Date(val).toLocaleString() : '—';
      },
    }),
    columnHelper.accessor('error', {
      header: 'Delivery Error',
      cell: (info) => (
        <span className="text-red-400 text-xs max-w-[200px] truncate block" title={info.getValue() || ''}>
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'template',
      header: 'Template',
      cell: () => <span className="text-xs text-gray-400">{campaign?.template?.name || '—'}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => {
                setViewRecipient(row);
                setPreviewTab('html');
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 hover:text-brand-400 text-gray-400 transition-all border border-white/5"
              title="View Rendered Email"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setEditRecipient(row);
                setEditName(row.name);
                setEditEmail(row.email);
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 hover:text-brand-400 text-gray-400 transition-all border border-white/5"
              title="Edit Recipient"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeletingRecipient(row)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-gray-400 transition-all border border-white/5"
              title="Delete Recipient"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }
    }),
  ], [campaign]);

  const fetchDetails = () => {
    if (!id) return;
    Promise.all([
      uploadApi.getCampaign(id),
      uploadApi.getCampaignRecipients(id, 1, 1000),
    ])
      .then(([campaignRes, recipientsRes]) => {
        setCampaign(campaignRes.data);
        setRecipients(recipientsRes.data.recipients);
      })
      .catch(() => {
        toast.error('Failed to refresh campaign details');
      });
  };

  useEffect(() => {
    if (!id) return;

    Promise.all([
      uploadApi.getCampaign(id),
      uploadApi.getCampaignRecipients(id, 1, 1000),
    ])
      .then(([campaignRes, recipientsRes]) => {
        setCampaign(campaignRes.data);
        setRecipients(recipientsRes.data.recipients);
      })
      .catch(() => {
        toast.error('Failed to load campaign details');
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Hook to handle active campaign sending if triggered on launch
  useEffect(() => {
    if (!id || !campaign || !shouldLaunch || sending) return;

    if (campaign.status !== 'processing') {
      return;
    }

    const runSendingLoop = async () => {
      setSending(true);
      window.history.replaceState(null, '', `/campaigns/${id}`);

      try {
        const initialRecipRes = await uploadApi.getCampaignRecipients(id, 1, 20);
        const totalBatches = initialRecipRes.data.totalPages;

        setBatchProgress({ current: 0, total: totalBatches, active: true });

        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const recipRes = page === 1 ? initialRecipRes : await uploadApi.getCampaignRecipients(id, page, 20);
          const pending = recipRes.data.recipients.filter((r) => r.status === 'pending');

          if (pending.length > 0) {
            await uploadApi.sendCampaignBatch(id, { recipientIds: pending.map((r) => r.id) });
          }

          setBatchProgress({ current: page, total: totalBatches, active: true });

          const [campRes, recRes] = await Promise.all([
            uploadApi.getCampaign(id),
            uploadApi.getCampaignRecipients(id, 1, 1000),
          ]);
          setCampaign(campRes.data);
          setRecipients(recRes.data.recipients);

          hasMore = page < recipRes.data.totalPages;
          page++;

          if (hasMore) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        await uploadApi.finalizeCampaign(id);
        toast.success('Campaign sent successfully! 🎉');

        const [campRes, recRes] = await Promise.all([
          uploadApi.getCampaign(id),
          uploadApi.getCampaignRecipients(id, 1, 1000),
        ]);
        setCampaign(campRes.data);
        setRecipients(recRes.data.recipients);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed during campaign sending');
      } finally {
        setBatchProgress(null);
        setSending(false);
      }
    };

    runSendingLoop();
  }, [id, campaign, shouldLaunch, sending]);

  // Hook to poll campaign status if it's currently processing and not actively driven by client loop
  useEffect(() => {
    if (!id || !campaign || campaign.status !== 'processing' || shouldLaunch || sending) return;

    const interval = setInterval(() => {
      fetchDetails();
    }, 5000);

    return () => clearInterval(interval);
  }, [id, campaign?.status, shouldLaunch, sending]);

  const handleEditRecipient = async () => {
    if (!editRecipient || !id) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setIsEditing(true);
    try {
      await uploadApi.updateRecipient(editRecipient.id, { name: editName, email: editEmail });
      toast.success('Recipient updated successfully');
      setEditRecipient(null);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update recipient');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteRecipient = async () => {
    if (!deletingRecipient || !id) return;
    setIsDeleting(true);
    try {
      await uploadApi.deleteRecipient(deletingRecipient.id);
      toast.success('Recipient removed successfully');
      setDeletingRecipient(null);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove recipient');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-gray-500">Campaign not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/contacts" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="page-title">Campaign Details</h1>
            <p className="text-gray-500 text-sm mt-1">
              Campaign: <span className="text-white font-medium">{campaign.name}</span>
              {campaign.template && ` • Template: ${campaign.template.name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>
            {new Date(campaign.createdAt).toLocaleDateString()}{' '}
            {new Date(campaign.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Processing / Sending indicator */}
      {((campaign.status === 'processing' && !shouldLaunch && !sending) || (batchProgress && batchProgress.active)) && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <p className="text-sm text-blue-400 font-medium">
              {batchProgress && batchProgress.active
                ? `Sending campaign emails... Batch ${batchProgress.current} of ${batchProgress.total} completed.`
                : 'Campaign sending is currently in progress...'}
            </p>
          </div>
          {batchProgress && batchProgress.active && (
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
              <div
                className="bg-brand-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Delivery Progress Stats */}
      <div className="space-y-2">
        <h2 className="section-title text-sm text-gray-400">Delivery Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatsCard
            title="Total Recipients"
            value={campaign.totalCount}
            icon={<Mail className="w-5 h-5" />}
            color="indigo"
            onClick={() => setSelectedFilter('all')}
            isActive={selectedFilter === 'all'}
          />
          <StatsCard
            title="Sent"
            value={campaign.sentCount}
            icon={<Send className="w-5 h-5" />}
            color="emerald"
            onClick={() => setSelectedFilter('sent')}
            isActive={selectedFilter === 'sent'}
          />
          <StatsCard
            title="Failed"
            value={campaign.failedCount}
            icon={<XCircle className="w-5 h-5" />}
            color="rose"
            onClick={() => setSelectedFilter('failed')}
            isActive={selectedFilter === 'failed'}
          />
          <StatsCard
            title="Pending"
            value={campaign.pendingCount}
            icon={<Clock className="w-5 h-5" />}
            color="amber"
            onClick={() => setSelectedFilter('pending')}
            isActive={selectedFilter === 'pending'}
          />
          <StatsCard
            title="Skipped"
            value={campaign.skippedCount}
            icon={<Ban className="w-5 h-5" />}
            color="indigo"
            onClick={() => setSelectedFilter('skipped')}
            isActive={selectedFilter === 'skipped'}
          />
        </div>
      </div>

      {/* Recipients Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            Recipient Logs
            {selectedFilter !== 'all' && (
              <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400 font-normal normal-case border border-white/5">
                Showing: <span className="capitalize font-semibold text-white">{selectedFilter}</span>
              </span>
            )}
          </h2>
          {selectedFilter !== 'all' && (
            <button
              onClick={() => setSelectedFilter('all')}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
            >
              Clear Filter
            </button>
          )}
        </div>
        <ReportTable data={filteredRecipients} columns={columns} pageSize={25} />
      </div>

      {/* View Email Modal */}
      {viewRecipient && campaign.template && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-white/10 flex flex-col max-h-[90vh]">
            <button
              onClick={() => setViewRecipient(null)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-brand-400" />
                Email Delivery Details
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Campaign Name: <span className="font-semibold text-white">{campaign.name}</span>
              </p>
            </div>

            {/* Subject Client Mock Box */}
            <div className="bg-slate-950 border border-white/10 rounded-xl p-4 space-y-3 text-xs text-gray-300">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="max-w-[80%]">
                  <span className="text-gray-500 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-white font-medium text-sm">
                    {campaign.template.subject
                      .replace(/\{\{\s*name\s*\}\}/g, viewRecipient.name)
                      .replace(/\{\{\s*email\s*\}\}/g, viewRecipient.email)
                    }
                  </span>
                </div>
                <StatusBadge status={viewRecipient.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-400">
                <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">To:</span>
                  <span className="text-gray-200">{viewRecipient.name} &lt;{viewRecipient.email}&gt;</span>
                </div>
                <div className="sm:text-right">
                  <span className="text-gray-500 font-semibold inline-block w-16">Sent At:</span>
                  <span className="text-gray-200">{viewRecipient.sentAt ? new Date(viewRecipient.sentAt).toLocaleString() : '—'}</span>
                </div>
                 <div>
                  <span className="text-gray-500 font-semibold inline-block w-16">From:</span>
                  <span className="text-gray-200">Vishv Umiya Foundation &lt;{campaign.senderEmail || 'marketing@vuf.org'}&gt;</span>
                </div>
                <div className="sm:text-right">
                  <span className="text-gray-500 font-semibold inline-block w-16">Template:</span>
                  <span className="text-gray-200">{campaign.template.name}</span>
                </div>
              </div>
            </div>

            {/* Tabs for HTML vs Plain Text */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setPreviewTab('html')}
                className={`py-2.5 px-4 text-xs font-semibold transition-all border-b-2 ${
                  previewTab === 'html'
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                HTML Preview
              </button>
              <button
                onClick={() => setPreviewTab('text')}
                className={`py-2.5 px-4 text-xs font-semibold transition-all border-b-2 ${
                  previewTab === 'text'
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Plain Text View
              </button>
            </div>

            {/* Body display */}
            <div className="flex-1 bg-slate-900 border border-white/5 rounded-xl p-4 min-h-[300px] overflow-y-auto flex flex-col">
              {previewTab === 'html' ? (
                <div className="bg-white rounded-lg p-2 flex-1 shadow-lg overflow-hidden flex flex-col">
                  <iframe
                    title="Rendered Email HTML"
                    className="w-full flex-1 border-none bg-white rounded min-h-[250px]"
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta charset="utf-8">
                          <style>
                            body {
                              font-family: 'Inter', system-ui, sans-serif;
                              color: #1e293b;
                              line-height: 1.5;
                              margin: 0;
                              padding: 15px;
                              background-color: #ffffff;
                            }
                          </style>
                        </head>
                        <body>
                          ${campaign.template.htmlBody
                            .replace(/\{\{\s*name\s*\}\}/g, viewRecipient.name)
                            .replace(/\{\{\s*email\s*\}\}/g, viewRecipient.email)
                            .replace(/\{\{\s*unsubscribeLink\s*\}\}/g, '#')
                          }
                        </body>
                      </html>
                    `}
                  />
                </div>
              ) : (
                <pre className="text-xs font-mono text-gray-300 bg-black/40 p-4 rounded-lg flex-1 overflow-x-auto whitespace-pre-wrap">
                  {campaign.template.plainTextBody
                    .replace(/\{\{\s*name\s*\}\}/g, viewRecipient.name)
                    .replace(/\{\{\s*email\s*\}\}/g, viewRecipient.email)
                    .replace(/\{\{\s*unsubscribeLink\s*\}\}/g, '#')
                  }
                </pre>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewRecipient(null)}
                className="btn-secondary text-sm py-2 px-6"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Recipient Modal */}
      {editRecipient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-white/10">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-brand-400" />
                Edit Recipient Details
              </h3>
              <button onClick={() => setEditRecipient(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Recipient Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400">Recipient Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditRecipient(null)}
                disabled={isEditing}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleEditRecipient}
                disabled={isEditing}
                className="btn-primary text-xs px-4 py-2 font-medium flex items-center gap-1.5"
              >
                {isEditing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isEditing ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deletingRecipient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-500/20 bg-red-950/20 animate-fade-in">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Remove Recipient?
              </h3>
              <button onClick={() => setDeletingRecipient(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              Are you sure you want to remove <strong className="text-white">{deletingRecipient.name} ({deletingRecipient.email})</strong> from this campaign history?
              This action will decrement the campaign status counters and delete the delivery logs for this recipient.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingRecipient(null)}
                disabled={isDeleting}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRecipient}
                disabled={isDeleting}
                className="bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs px-4 py-2 font-medium transition-all flex items-center gap-1.5"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
