import { Video, MapPin, Phone, Building2, ExternalLink, CalendarClock } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import Card from './ui/Card';

const TYPE_META = {
  video: { Icon: Video, label: 'Video', color: 'from-blue-500/15 to-blue-500/5 text-blue-600' },
  onsite: { Icon: MapPin, label: 'Onsite', color: 'from-orange-500/15 to-orange-500/5 text-orange-600' },
  phone: { Icon: Phone, label: 'Phone', color: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600' },
};

function countdown(scheduledAt) {
  const days = differenceInCalendarDays(new Date(scheduledAt), new Date());
  if (days < 0) return { text: 'Past', tone: 'bg-slate-100 text-slate-500 ring-slate-200' };
  if (days === 0) return { text: 'Today', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
  if (days === 1) return { text: 'Tomorrow', tone: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return { text: `in ${days} days`, tone: 'bg-blue-50 text-blue-700 ring-blue-200' };
}

export default function InterviewCard({ interview }) {
  const meta = TYPE_META[interview.interviewType] || TYPE_META.phone;
  const cd = countdown(interview.scheduledAt);
  const mapsUrl = interview.officeAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(interview.officeAddress)}`
    : null;

  return (
    <Card hover className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.color}`}>
            <meta.Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">{interview.jobTitle}</h3>
            <p className="flex items-center gap-1 text-sm text-slate-500">
              <Building2 className="h-3.5 w-3.5" /> {interview.company}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cd.tone}`}>
          {cd.text}
        </span>
      </div>

      <p className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-100">
        <CalendarClock className="h-4 w-4 text-brand-violet" />
        {format(new Date(interview.scheduledAt), "EEE, dd MMM 'at' h:mm a")}
      </p>

      {interview.meetingLink && (
        <a href={interview.meetingLink} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
          Join meeting <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {interview.officeAddress && (
        <a href={mapsUrl} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
          {interview.officeAddress} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {interview.notes && <p className="text-xs text-slate-500">{interview.notes}</p>}
    </Card>
  );
}
