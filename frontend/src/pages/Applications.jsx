import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { useApplications } from '../hooks/useApplications';
import { exportCsv } from '../api/applications';
import { APP_STATUSES } from '../constants/appStatus';
import { LOCATION_TYPES } from '../constants/jobTypes';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ApplicationRow from '../components/ApplicationRow';

const STATUS_OPTIONS = APP_STATUSES.map((s) => ({ value: s.value, label: s.label }));
const LOCATION_OPTIONS = LOCATION_TYPES.map((v) => ({ value: v, label: v }));

export default function Applications() {
  const [filters, setFilters] = useState({ status: '', locationType: '' });
  const { applications, isLoading, updateStatus } = useApplications(filters);

  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  function onStatusChange(id, status) {
    updateStatus.mutate({ id, updates: { status } }, { onSuccess: () => toast.success('Status updated') });
  }

  async function handleExport() {
    const blob = await exportCsv();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'applications.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const counts = applications.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Applications</h1>
          <p className="text-sm text-slate-500">Manage your pipeline end to end.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select placeholder="All statuses" options={STATUS_OPTIONS} value={filters.status} onChange={(e) => update('status', e.target.value)} />
          <Select placeholder="All locations" options={LOCATION_OPTIONS} value={filters.locationType} onChange={(e) => update('locationType', e.target.value)} />
          <Button variant="secondary" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {APP_STATUSES.map((s) => (
          <span key={s.value} className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            {s.label}: <span className="font-bold text-brand-navy">{counts[s.value] || 0}</span>
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="skeleton h-48 rounded-3xl" />
      ) : applications.length === 0 ? (
        <EmptyState title="No applications" description="Applications you track will appear here." />
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 bg-white/50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <ApplicationRow key={a.id} application={a} onStatusChange={onStatusChange} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
