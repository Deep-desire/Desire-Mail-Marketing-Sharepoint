import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
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
const activeSendingCampaigns = new Set<string>();

export default function CampaignDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const shouldLaunch = searchParams.get('launch') === 'true';
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelingCampaign, setCancelingCampaign] = useState(false);
  const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editSendImmediately, setEditSendImmediately] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'sent' | 'failed' | 'pending' | 'skipped'>('all');

  // Helper to format date for datetime-local input (YYYY-MM-DDTHH:MM in local time)
  const getLocalDatetimeString = (dateObj: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  };

  const getInitialScheduledTime = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return getLocalDatetimeString(d);
  };

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
      cell: (info) => <span className="font-semibold text-gray-900">{info.getValue() || '—'}</span>,
    }),
    columnHelper.accessor('email', {
      header: 'Email',
      cell: (info) => <span className="font-mono text-xs text-gray-600">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'validation',
      header: 'Validation',
      cell: (info) => {
        const row = info.row.original;
        let valStatus: 'valid' | 'invalid' | 'unsubscribed' = 'valid';
        if (row.error === 'Invalid email format') valStatus = 'invalid';
        else if (row.error === 'Email is unsubscribed') valStatus = 'unsubscribed';

        let color = 'bg-emerald-50 text-emerald-700 border border-emerald-250 border-emerald-200';
        if (valStatus === 'invalid') color = 'bg-red-50 text-red-700 border border-red-200';
        if (valStatus === 'unsubscribed') color = 'bg-gray-100 text-gray-700 border border-gray-300';

        return (
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border ${color}`}>
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
        <span className="text-red-600 text-xs max-w-[200px] truncate block" title={info.getValue() || ''}>
          {info.getValue() || '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'template',
      header: 'Template',
      cell: () => <span className="text-xs text-gray-500">{campaign?.template?.name || '—'}</span>,
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
              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-brand-50 hover:text-brand-600 text-gray-650 text-gray-500 transition-all shadow-sm"
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
              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-brand-50 hover:text-brand-600 text-gray-650 text-gray-500 transition-all shadow-sm"
              title="Edit Recipient"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeletingRecipient(row)}
              className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-red-50 hover:text-red-600 text-gray-650 text-gray-500 transition-all shadow-sm"
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

  // Clean up url parameters and set active sending if launch is triggered
  useEffect(() => {
    if (shouldLaunch && id) {
      window.history.replaceState(null, '', `/campaigns/${id}`);
    }
  }, [id, shouldLaunch]);

  // Hook to poll campaign status if it's currently processing on the server
  useEffect(() => {
    if (!id || !campaign || campaign.status !== 'processing') return;

    const interval = setInterval(() => {
      fetchDetails();
    }, 5000);

    return () => clearInterval(interval);
  }, [id, campaign?.status]);

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

  const handleCancelCampaign = async () => {
    if (!campaign) return;
    setCancelingCampaign(true);
    try {
      await uploadApi.deleteCampaign(campaign.id);
      toast.success('Campaign schedule cancelled');
      setIsCancelModalOpen(false);
      navigate('/contacts');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel campaign schedule');
    } finally {
      setCancelingCampaign(false);
    }
  };

  const handleUpdateCampaignSchedule = async () => {
    if (!campaign) return;
    if (!editSendImmediately) {
      if (!editScheduledAt) {
        toast.error('Please complete the date & time selection (including hour, minute, and AM/PM)');
        return;
      }
      if (new Date(editScheduledAt) <= new Date()) {
        toast.error('Scheduled date and time must be in the future');
        return;
      }
    }

    try {
      await uploadApi.updateCampaign(campaign.id, {
        scheduledAt: editSendImmediately ? null : new Date(editScheduledAt).toISOString(),
        sendImmediately: editSendImmediately,
      });
      toast.success(editSendImmediately ? 'Campaign started successfully! 🎉' : 'Campaign rescheduled successfully!');
      setIsEditScheduleOpen(false);
      fetchDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reschedule campaign');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-gray-500 font-medium">Campaign not found</div>;
  }

  const progressPercent = campaign.totalCount > 0
    ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.totalCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="flex items-center gap-4">
          <Link to="/contacts" className="p-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-650 text-gray-500 transition-colors shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="page-title">Campaign Details</h1>
            <p className="text-gray-500 text-sm mt-1">
              Campaign: <span className="text-gray-900 font-semibold">{campaign.name}</span>
              {campaign.template && ` • Template: ${campaign.template.name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>
            {new Date(campaign.createdAt).toLocaleDateString()}{' '}
            {new Date(campaign.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Campaign Scheduled Banner */}
      {campaign.status === 'scheduled' && campaign.scheduledAt && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-100/50 border border-purple-200 rounded-xl shrink-0 shadow-sm text-purple-650 text-purple-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950">Campaign Scheduled</h3>
              <p className="text-sm text-purple-800 mt-0.5">
                This email campaign is scheduled to start automatically on{' '}
                <span className="font-semibold">
                  {new Date(campaign.scheduledAt).toLocaleDateString()}{' '}
                  {new Date(campaign.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>.
              </p>
              {campaign.template && (
                <p className="text-xs text-purple-500 mt-1">
                  Template:{' '}
                  <span className="font-semibold text-purple-700">{campaign.template.name}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={() => {
                setEditScheduledAt(campaign.scheduledAt ? getLocalDatetimeString(new Date(campaign.scheduledAt)) : getInitialScheduledTime());
                setEditSendImmediately(false);
                setIsEditScheduleOpen(true);
              }}
              className="flex-1 md:flex-none px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-[0.98]"
            >
              Edit Schedule
            </button>
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="flex-1 md:flex-none px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-[0.98]"
            >
              Cancel Schedule
            </button>
          </div>
        </div>
      )}

      {/* Processing / Sending indicator */}
      {campaign.status === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <p className="text-sm text-blue-800 font-semibold">
              Campaign sending is in progress on the server... {campaign.sentCount + campaign.failedCount} / {campaign.totalCount} emails processed ({progressPercent}%).
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200 shadow-inner">
            <div
              className="bg-brand-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Delivery Progress Stats */}
      <div className="space-y-2">
        <h2 className="section-title text-sm text-gray-500 font-semibold">Delivery Status</h2>
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
              <span className="text-xs px-2.5 py-0.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 font-bold normal-case">
                Showing: <span className="capitalize">{selectedFilter}</span>
              </span>
            )}
          </h2>
          {selectedFilter !== 'all' && (
            <button
              onClick={() => setSelectedFilter('all')}
              className="text-xs text-brand-600 hover:text-brand-700 transition-colors font-semibold"
            >
              Clear Filter
            </button>
          )}
        </div>
        <ReportTable data={filteredRecipients} columns={columns} pageSize={25} />
      </div>

      {/* View Email Modal */}
      {viewRecipient && campaign.template && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-8 animate-fade-in">
          <div className="glass-card max-w-3xl w-full p-6 space-y-4 relative border border-gray-200 bg-white flex flex-col max-h-[90vh] shadow-2xl">
            <button
              onClick={() => setViewRecipient(null)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-brand-600" />
                Email Delivery Details
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Campaign Name: <span className="font-semibold text-gray-800">{campaign.name}</span>
              </p>
            </div>

            {/* Subject Client Mock Box */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-xs text-gray-600 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="max-w-[80%]">
                  <span className="text-gray-400 font-semibold inline-block w-16">Subject:</span>
                  <span className="text-gray-900 font-bold text-sm">
                    {campaign.template.subject
                      .replace(/\{\{\s*name\s*\}\}/g, viewRecipient.name)
                      .replace(/\{\{\s*email\s*\}\}/g, viewRecipient.email)
                    }
                  </span>
                </div>
                <StatusBadge status={viewRecipient.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-500">
                <div>
                  <span className="text-gray-400 font-semibold inline-block w-16">To:</span>
                  <span className="text-gray-800 font-medium">{viewRecipient.name} &lt;{viewRecipient.email}&gt;</span>
                </div>
                <div className="sm:text-right">
                  <span className="text-gray-400 font-semibold inline-block w-16">Sent At:</span>
                  <span className="text-gray-800 font-medium">{viewRecipient.sentAt ? new Date(viewRecipient.sentAt).toLocaleString() : '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold inline-block w-16">From:</span>
                  <span className="text-gray-800 font-medium">Vishv Umiya Foundation &lt;{campaign.senderEmail || 'marketing@vuf.org'}&gt;</span>
                </div>
                <div className="sm:text-right">
                  <span className="text-gray-400 font-semibold inline-block w-16">Template:</span>
                  <span className="text-gray-800 font-medium">{campaign.template.name}</span>
                </div>
              </div>
            </div>

            {/* Tabs for HTML vs Plain Text */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setPreviewTab('html')}
                className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 ${previewTab === 'html'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
              >
                HTML Preview
              </button>
              <button
                onClick={() => setPreviewTab('text')}
                className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 ${previewTab === 'text'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
              >
                Plain Text View
              </button>
            </div>

            {/* Body display */}
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4 min-h-[300px] overflow-y-auto flex flex-col shadow-inner">
              {previewTab === 'html' ? (
                <div className="bg-white rounded-lg p-2 flex-1 shadow-sm border border-gray-200 overflow-hidden flex flex-col">
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
                <pre className="text-xs font-mono text-gray-700 bg-white p-4 rounded-lg flex-1 overflow-x-auto whitespace-pre-wrap border border-gray-200 shadow-sm">
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
        </div>,
        document.body
      )}

      {/* Edit Recipient Modal */}
      {editRecipient && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-gray-200 bg-white shadow-2xl">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-brand-600" />
                Edit Recipient Details
              </h3>
              <button onClick={() => setEditRecipient(null)} className="text-gray-400 hover:text-gray-650 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Recipient Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-905 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Recipient Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-905 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
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
                className="btn-primary text-xs px-4 py-2 font-semibold flex items-center gap-1.5 shadow-sm"
              >
                {isEditing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isEditing ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirm Modal */}
      {deletingRecipient && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-200 bg-white shadow-2xl">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Remove Recipient?
              </h3>
              <button onClick={() => setDeletingRecipient(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Are you sure you want to remove <strong className="text-gray-900 font-semibold">{deletingRecipient.name} ({deletingRecipient.email})</strong> from this campaign history?
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
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs px-4 py-2 font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cancel Campaign Schedule Confirmation Modal */}
      {isCancelModalOpen && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex-center z-50 p-4 animate-fade-in flex items-center justify-center">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-red-200 bg-white shadow-2xl rounded-2xl">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Cancel Campaign Schedule?
              </h3>
              <button onClick={() => setIsCancelModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Are you sure you want to cancel the schedule for <strong className="text-gray-900 font-semibold">"{campaign.name}"</strong>?
              This will delete the campaign and all its recipient records. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                disabled={cancelingCampaign}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelCampaign}
                disabled={cancelingCampaign}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs px-4 py-2 font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {cancelingCampaign && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Cancel Schedule
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Schedule Modal */}
      {isEditScheduleOpen && campaign && createPortal(
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-4 relative border border-gray-200 bg-white shadow-2xl rounded-2xl">
            <button
              onClick={() => setIsEditScheduleOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-gray-500 shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-600" />
              Reschedule Campaign
            </h3>
            <p className="text-xs text-gray-500">
              Update details for scheduled campaign: <span className="font-semibold text-gray-800">{campaign.name}</span>
            </p>

            <div className="space-y-4 pt-2">
              {/* Send Mode choice */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500">Dispatch Option</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditSendImmediately(true)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                      editSendImmediately
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Send Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSendImmediately(false)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                      !editSendImmediately
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Schedule for Later
                  </button>
                </div>
              </div>

              {!editSendImmediately && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">New Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editScheduledAt}
                    onChange={(e) => setEditScheduledAt(e.target.value)}
                    min={getLocalDatetimeString(new Date())}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-gray-900 text-sm focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Expected format: MM/DD/YYYY, 12-Hour format (e.g. 07/13/2026, 04:30 PM).
                    Please ensure all fields are fully completed.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => setIsEditScheduleOpen(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCampaignSchedule}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
