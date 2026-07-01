import { useState } from 'react';
import { SearchX, Search } from 'lucide-react';
import { useJobs } from '../hooks/useJobs';
import { LOCATION_TYPES, PLATFORMS } from '../constants/jobTypes';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import JobCard from '../components/JobCard';
import CoverLetterModal from '../components/CoverLetterModal';

const LOCATION_OPTIONS = LOCATION_TYPES.map((v) => ({ value: v, label: v }));
const PLATFORM_OPTIONS = PLATFORMS.map((v) => ({ value: v, label: v }));
const SORT_OPTIONS = [
  { value: 'score', label: 'Sort: Match score' },
  { value: 'distance', label: 'Sort: Distance (Karachi)' },
];

export default function Jobs() {
  const [filters, setFilters] = useState({ locationType: '', platform: '', minScore: 0, q: '', sort: 'score' });
  const [activeJob, setActiveJob] = useState(null);
  const { jobs, isLoading } = useJobs(filters);

  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Jobs</h1>
        <p className="text-sm text-slate-500">{jobs.length} matched roles for you.</p>
      </div>

      <Card className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Select placeholder="All locations" options={LOCATION_OPTIONS} value={filters.locationType} onChange={(e) => update('locationType', e.target.value)} />
        <Select placeholder="All platforms" options={PLATFORM_OPTIONS} value={filters.platform} onChange={(e) => update('platform', e.target.value)} />
        <Select options={SORT_OPTIONS} value={filters.sort} onChange={(e) => update('sort', e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Min match score: <span className="text-brand-violet">{filters.minScore}</span></label>
          <input type="range" min="0" max="100" step="5" value={filters.minScore}
            onChange={(e) => update('minScore', Number(e.target.value))}
            className="mt-2.5 w-full accent-brand-violet" />
        </div>
        <div className="md:col-span-2 lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={filters.q} onChange={(e) => update('q', e.target.value)}
              placeholder="Search title or company…"
              className="w-full rounded-xl bg-white/70 py-2.5 pl-10 pr-3.5 text-sm text-slate-800 shadow-sm outline-none ring-1 ring-inset ring-slate-200 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-violet/60" />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="skeleton h-64 rounded-3xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={SearchX} title="No jobs found" description="Try adjusting your filters or search term." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onApply={setActiveJob} />
          ))}
        </div>
      )}

      <CoverLetterModal isOpen={!!activeJob} job={activeJob} onClose={() => setActiveJob(null)} />
    </div>
  );
}
