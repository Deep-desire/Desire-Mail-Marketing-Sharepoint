import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { templateApi } from '../api/template.api';
import { Template } from '../types';

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = () => {
    templateApi
      .getAll()
      .then((res) => setTemplates(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(fetchTemplates, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await templateApi.delete(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="text-gray-500 mt-1">{templates.length} templates</p>
        </div>
        <Link to="/templates/create" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="glass-card p-12 text-center bg-white border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-700 font-semibold">No templates yet</p>
          <p className="text-sm text-gray-500 mt-1">Create your first email template to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <div key={t.id} className="glass-card-hover p-6 group bg-white border border-gray-200 shadow-sm hover:border-brand-400 hover:shadow-md transition-all duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-xl bg-brand-50 border border-brand-100">
                  <FileText className="w-5 h-5 text-brand-600" />
                </div>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-600 transition-all border border-transparent hover:border-red-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{t.name}</h3>
              <p className="text-sm text-gray-500 mb-3 truncate">Subject: {t.subject}</p>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {new Date(t.createdAt).toLocaleDateString()}
                </span>
                <Link
                  to={`/templates/${t.id}/edit`}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors"
                >
                  Edit →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
