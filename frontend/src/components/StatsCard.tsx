import { ReactNode } from 'react';

interface Props {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: 'indigo' | 'emerald' | 'amber' | 'rose';
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
}

const colorMap = {
  indigo: {
    bg: 'bg-white',
    border: 'border-gray-200',
    borderActive: 'border-brand-500 ring-2 ring-brand-500/10',
    hover: 'hover:border-brand-500 hover:ring-2 hover:ring-brand-500/10',
    icon: 'bg-brand-50 text-brand-600',
    glow: 'shadow-sm',
  },
  emerald: {
    bg: 'bg-white',
    border: 'border-gray-200',
    borderActive: 'border-emerald-500 ring-2 ring-emerald-500/10',
    hover: 'hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/10',
    icon: 'bg-emerald-50 text-emerald-600',
    glow: 'shadow-sm',
  },
  amber: {
    bg: 'bg-white',
    border: 'border-gray-200',
    borderActive: 'border-amber-500 ring-2 ring-amber-500/10',
    hover: 'hover:border-amber-500 hover:ring-2 hover:ring-amber-500/10',
    icon: 'bg-amber-50 text-amber-600',
    glow: 'shadow-sm',
  },
  rose: {
    bg: 'bg-white',
    border: 'border-gray-200',
    borderActive: 'border-rose-500 ring-2 ring-rose-500/10',
    hover: 'hover:border-rose-500 hover:ring-2 hover:ring-rose-500/10',
    icon: 'bg-rose-50 text-rose-600',
    glow: 'shadow-sm',
  },
};

export default function StatsCard({ title, value, icon, color, subtitle, onClick, isActive }: Props) {
  const c = colorMap[color];

  return (
    <div
      onClick={onClick}
      className={`glass-card ${c.bg} border ${
        isActive ? c.borderActive : `${c.border} ${c.hover}`
      } p-6 ${c.glow} 
                  transition-all duration-200 hover:shadow-md ${
                    onClick ? 'cursor-pointer select-none active:scale-[0.98]' : ''
                  }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value.toLocaleString()}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${c.icon}`}>{icon}</div>
      </div>
    </div>
  );
}
