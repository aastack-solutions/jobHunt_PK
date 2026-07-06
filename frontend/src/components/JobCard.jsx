import { Building2, MapPin, Sparkles, ExternalLink } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import MatchBadge from './MatchBadge';
import LocationTypePill from './LocationTypePill';
import { formatSalary } from '../lib/format';

export default function JobCard({ job, onApply, onViewDetails }) {
  // matchedSkills come from the matching engine (Week 4); until then show the
  // job's own parsed skills.
  const skills = job.matchedSkills?.length ? job.matchedSkills : job.skills || [];
  const visible = skills.slice(0, 4);
  const overflow = skills.length - visible.length;

  return (
    <Card hover className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-800">{job.title}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Building2 className="h-3.5 w-3.5" /> {job.company}
          </p>
        </div>
        <MatchBadge score={job.matchScore} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LocationTypePill locationType={job.locationType} />
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-slate-600 ring-1 ring-inset ring-slate-200">
          {job.platform}
        </span>
        {job.distanceKm != null && (
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
            <MapPin className="h-3 w-3" /> {job.distanceKm} km
          </span>
        )}
      </div>

      <div className="rounded-xl bg-white/50 px-3 py-2 ring-1 ring-inset ring-slate-100">
        <p className="text-sm font-bold text-brand-navy">
          {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-blue"
          >
            <Sparkles className="h-2.5 w-2.5" /> {skill}
          </span>
        ))}
        {overflow > 0 && (
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            +{overflow} more
          </span>
        )}
      </div>

      <div className="mt-auto flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={() => onApply?.(job)}>
          <Sparkles className="h-4 w-4" /> Apply
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onViewDetails?.(job)}>
          <ExternalLink className="h-4 w-4" /> Details
        </Button>
      </div>
    </Card>
  );
}
