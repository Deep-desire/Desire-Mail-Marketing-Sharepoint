import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Send, AlertTriangle } from 'lucide-react';
import StatsCard from '../components/StatsCard';
import { uploadApi } from '../api/upload.api';
import { DashboardStats } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    uploadApi
      .getDashboardStats()
      .then((res) => setStats(res.data))
      .catch(() => setStats({ totalCampaigns: 0, totalTemplates: 0, totalEmailsSent: 0, totalFailedEmails: 0 }))
      .finally(() => setLoading(false));
  }, []);

  const admin = JSON.parse(localStorage.getItem('desire_admin') || '{}');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome back, <span className="text-brand-600 font-semibold">{admin.name || 'Admin'}</span>
        </p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-6 bg-white border border-gray-200 shadow-sm animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Campaigns"
            value={stats.totalCampaigns ?? 0}
            icon={<Upload className="w-6 h-6" />}
            color="indigo"
            onClick={() => navigate('/contacts')}
          />
          <StatsCard
            title="Templates"
            value={stats.totalTemplates ?? 0}
            icon={<FileText className="w-6 h-6" />}
            color="amber"
            onClick={() => navigate('/templates')}
          />
          <StatsCard
            title="Emails Sent"
            value={stats.totalEmailsSent ?? 0}
            icon={<Send className="w-6 h-6" />}
            color="emerald"
            onClick={() => navigate('/emails?filter=sent')}
          />
          <StatsCard
            title="Failed Emails"
            value={stats.totalFailedEmails ?? 0}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="rose"
            onClick={() => navigate('/emails?filter=failed')}
          />
        </div>
      ) : null}

      {/* Quick Actions */}
      <div>
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a href="/contacts" className="glass-card-hover p-6 group block bg-white border border-gray-200 shadow-sm hover:border-brand-400 hover:shadow-md transition-all duration-300">
            <Upload className="w-8 h-8 text-brand-600 mb-3 transition-transform group-hover:scale-105" />
            <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">SharePoint Contacts</h3>
            <p className="text-sm text-gray-500 mt-1">Sync contacts from SharePoint &amp; launch campaigns</p>
          </a>
          <a href="/templates/create" className="glass-card-hover p-6 group block bg-white border border-gray-200 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all duration-300">
            <FileText className="w-8 h-8 text-emerald-600 mb-3 transition-transform group-hover:scale-105" />
            <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors">Create Template</h3>
            <p className="text-sm text-gray-500 mt-1">Design a new email template</p>
          </a>
        </div>
      </div>
    </div>
  );
}
