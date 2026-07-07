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
            <span className="font-semibold text-gray-900">{row.name || '—'}</span>
            <span className="text-gray-500 text-xs font-mono mt-0.5">{row.email}</span>
          </div>
        );
      }
    }),
    columnHelper.accessor('campaign.name' as any, {
      header: 'Campaign File',
      cell: (info) => {
        const row = info.row.original;
        return <span className="text-gray-800 font-medium">{row.campaign?.name || '—'}</span>;
      }
    }),
    columnHelper.accessor('campaign.template.name' as any, {
      header: 'Template',
      cell: (info) => {
        const row = info.row.original;
        return <span className="text-gray-500 text-xs">{row.campaign?.template?.name || '—'}</span>;
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
          <span className="text-red-600 text-xs max-w-[200px] truncate block font-medium" title={err}>
            {err}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
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
            className="px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 hover:bg-brand-100 hover:text-brand-700 transition-all text-xs font-semibold flex items-center gap-1.5 w-fit shadow-sm"
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
      return "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-brand-200 bg-brand-50 text-brand-700 shadow-sm select-none";
    }
    return "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50";
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="page-title">Delivery Logs</h1>
          <p className="text-gray-500 text-sm mt-1">Track and review sent or failed marketing emails.</p>
        </div>
        <button
          onClick={fetchLogs}
          className="p-2.5 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-500 transition-colors shadow-sm"
          title="Refresh Logs"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            <Search className="w-4 h-4 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-950 placeholder-gray-400 focus:outline-none focus:border-brand-500 transition-colors shadow-sm h-[38px]"
          />
        </div>
      </div>

      {/* Logs Table Container */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <ReportTable data={filteredRecipients} columns={columns} pageSize={15} />
        </div>
      )}
    </div>
  );
}
