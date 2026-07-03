import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Loader2,
  Mail,
  Send,
  XCircle,
  Clock,
  Ban,
  Search,
  Eye,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import toast from 'react-hot-toast';
import ReportTable from '../components/ReportTable';
import StatusBadge from '../components/StatusBadge';
import { uploadApi } from '../api/upload.api';
import { Recipient } from '../types';

type RecipientWithCampaign = Recipient & { campaign: { name: string; template?: { name: string } } };

const columnHelper = createColumnHelper<RecipientWithCampaign>();

export default function Emails() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get('filter') || 'all';

  const [recipients, setRecipients] = useState<RecipientWithCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = () => {
    setLoading(true);
    uploadApi.getRecipients()
      .then((res) => {
        setRecipients(res.data.recipients);
      })
      .catch(() => {
        toast.error('Failed to load delivery logs');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const activeTab = useMemo(() => {
    const valid = ['all', 'sent', 'failed', 'pending', 'skipped'];
    return valid.includes(filterParam) ? filterParam : 'all';
  }, [filterParam]);

  const handleTabChange = (tab: string) => {
    setSearchParams({ filter: tab });
  };

  // Filter and search logic
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // 1. Status Filter
      if (activeTab !== 'all' && r.status !== activeTab) {
        return false;
      }
      // 2. Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const nameMatch = r.name?.toLowerCase().includes(query);
        const emailMatch = r.email?.toLowerCase().includes(query);
        return nameMatch || emailMatch;
      }
      return true;
    });
  }, [recipients, activeTab, searchQuery]);

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Recipient',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col py-1">
            <span className="font-semibold text-white">{row.name || '—'}</span>
            <span className="text-gray-500 text-xs font-mono mt-0.5">{row.email}</span>
          </div>
        );
      }
    }),
    columnHelper.accessor('campaign.name' as any, {
      header: 'Campaign File',
      cell: (info) => {
        const row = info.row.original;
        return <span className="text-gray-300 font-medium">{row.campaign?.name || '—'}</span>;
      }
    }),
    columnHelper.accessor('campaign.template.name' as any, {
      header: 'Template',
      cell: (info) => {
        const row = info.row.original;
        return <span className="text-gray-400 text-xs">{row.campaign?.template?.name || '—'}</span>;
      }
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('sentAt', {
      header: 'Sent / Attempted At',
      cell: (info) => {
        const val = info.getValue();
        return val ? new Date(val).toLocaleString() : '—';
      }
    }),
    columnHelper.accessor('error', {
      header: 'Error Details',
      cell: (info) => {
        const err = info.getValue();
        return err ? (
          <span className="text-red-400 text-xs max-w-[200px] truncate block" title={err}>
            {err}
          </span>
        ) : (
          <span className="text-gray-500">—</span>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        return (
          <Link
            to={`/campaigns/${row.campaignId}`}
            className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 hover:bg-brand-500/20 transition-all text-xs font-medium flex items-center gap-1.5 w-fit"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </Link>
        );
      }
    })
  ], []);

  const getTabClass = (tab: string) => {
    const isActive = activeTab === tab;
    if (isActive) {
      return "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-brand-500/60 bg-brand-950/85 text-brand-400 shadow-lg shadow-brand-500/5 select-none";
    }
    return "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-transparent text-gray-400 hover:text-white hover:bg-white/5";
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Delivery Logs</h1>
          <p className="text-gray-500 text-sm mt-1">Track and review sent or failed marketing emails.</p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 transition-colors"
          title="Refresh Logs"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ALL LOGS */}
          <button
            onClick={() => handleTabChange('all')}
            className={getTabClass('all')}
          >
            <Mail className="w-3.5 h-3.5" />
            ALL LOGS
          </button>

          {/* SENT */}
          <button
            onClick={() => handleTabChange('sent')}
            className={getTabClass('sent')}
          >
            <Send className="w-3.5 h-3.5" />
            SENT
          </button>

          {/* FAILED */}
          <button
            onClick={() => handleTabChange('failed')}
            className={getTabClass('failed')}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            FAILED
          </button>

          {/* PENDING */}
          <button
            onClick={() => handleTabChange('pending')}
            className={getTabClass('pending')}
          >
            <Clock className="w-3.5 h-3.5" />
            PENDING
          </button>

          {/* SKIPPED */}
          <button
            onClick={() => handleTabChange('skipped')}
            className={getTabClass('skipped')}
          >
            <Ban className="w-3.5 h-3.5" />
            SKIPPED
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-gray-500" />
          </span>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
      </div>

      {/* Logs Table Container */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <ReportTable data={filteredRecipients} columns={columns} pageSize={15} />
        </div>
      )}
    </div>
  );
}
