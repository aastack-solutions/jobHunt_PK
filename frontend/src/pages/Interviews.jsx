import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { format, differenceInCalendarDays } from 'date-fns';
import { Plus, CalendarClock } from 'lucide-react';
import { useInterviews } from '../hooks/useInterviews';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import InterviewCard from '../components/InterviewCard';

const schema = z.object({
  jobTitle: z.string().min(1, 'Required'),
  company: z.string().min(1, 'Required'),
  interviewType: z.enum(['video', 'onsite', 'phone']),
  scheduledAt: z.string().min(1, 'Required'),
  meetingLink: z.string().optional(),
  officeAddress: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: 'video', label: 'Video' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'phone', label: 'Phone' },
];

function nextLabel(date) {
  const days = differenceInCalendarDays(new Date(date), new Date());
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

export default function Interviews() {
  const [isOpen, setIsOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const { interviews, isLoading, create } = useInterviews();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { interviewType: 'video' },
  });

  const now = Date.now();
  const upcoming = interviews.filter((i) => new Date(i.scheduledAt).getTime() >= now);
  const past = interviews.filter((i) => new Date(i.scheduledAt).getTime() < now);
  const next = upcoming[0];

  function onSubmit(values) {
    const payload = { ...values, scheduledAt: new Date(values.scheduledAt).toISOString() };
    create.mutate(payload, {
      onSuccess: () => {
        toast.success('Interview scheduled');
        setIsOpen(false);
        reset();
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Interviews</h1>
          <p className="text-sm text-slate-500">Your scheduled conversations, all in one place.</p>
        </div>
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" /> Schedule
        </Button>
      </div>

      {next && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-blue via-brand-violet to-brand-pink p-6 text-white shadow-lg">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 animate-floaty" />
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Next up · {nextLabel(next.scheduledAt)}</p>
          <h2 className="mt-1 text-xl font-extrabold">{next.jobTitle}</h2>
          <p className="text-sm text-white/80">{next.company}</p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" />
            {format(new Date(next.scheduledAt), "EEEE, dd MMM 'at' h:mm a")}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : upcoming.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No upcoming interviews" description="Schedule one to see it here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {upcoming.map((i) => <InterviewCard key={i.id} interview={i} />)}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowPast((p) => !p)} className="text-sm font-semibold text-brand-blue hover:underline">
            {showPast ? 'Hide' : 'Show'} past interviews ({past.length})
          </button>
          {showPast && (
            <div className="mt-3 grid grid-cols-1 gap-4 opacity-70 md:grid-cols-2">
              {past.map((i) => <InterviewCard key={i.id} interview={i} />)}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Schedule Interview">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <Input label="Job title" name="jobTitle" register={register} error={errors.jobTitle?.message} />
          <Input label="Company" name="company" register={register} error={errors.company?.message} />
          <Select label="Type" name="interviewType" options={TYPE_OPTIONS} register={register} />
          <Input label="Date & time" name="scheduledAt" type="datetime-local" register={register} error={errors.scheduledAt?.message} />
          <Input label="Meeting link (optional)" name="meetingLink" register={register} />
          <Input label="Office address (optional)" name="officeAddress" register={register} />
          <Button type="submit" loading={create.isPending} className="mt-1">Save interview</Button>
        </form>
      </Modal>
    </div>
  );
}
