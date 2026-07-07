interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  // Contact statuses
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  invalid: 'bg-red-50 text-red-700 border-red-200',
  duplicate: 'bg-amber-50 text-amber-700 border-amber-200',
  unsubscribed: 'bg-gray-150 text-gray-700 border-gray-300 bg-gray-100',

  // Campaign statuses
  draft: 'bg-slate-50 text-slate-700 border-slate-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',

  // Recipient statuses
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  skipped: 'bg-gray-50 text-gray-650 text-gray-600 border-gray-200',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const colors = statusColors[status] || 'bg-gray-50 text-gray-750 border-gray-200';
  const sizeClass = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-lg border ${colors} ${sizeClass} capitalize`}
    >
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-soft mr-1.5" />
      )}
      {status}
    </span>
  );
}
