import Card from './ui/Card';

export default function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <Card hover className="overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-brand-navy">{value}</p>
          {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue/15 to-brand-violet/15">
            <Icon className="h-5 w-5 text-brand-violet" />
          </div>
        )}
      </div>
    </Card>
  );
}
