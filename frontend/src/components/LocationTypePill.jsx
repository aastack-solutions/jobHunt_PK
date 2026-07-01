import { Globe, Building2, Layers } from 'lucide-react';

const STYLES = {
  Remote: { color: 'bg-blue-50 text-blue-700 ring-blue-200', Icon: Globe },
  Onsite: { color: 'bg-orange-50 text-orange-700 ring-orange-200', Icon: Building2 },
  Hybrid: { color: 'bg-violet-50 text-violet-700 ring-violet-200', Icon: Layers },
};

export default function LocationTypePill({ locationType }) {
  const { color, Icon } = STYLES[locationType] || {
    color: 'bg-slate-100 text-slate-600 ring-slate-200',
    Icon: Globe,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${color}`}>
      <Icon className="h-3 w-3" />
      {locationType}
    </span>
  );
}
