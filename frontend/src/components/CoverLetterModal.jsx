import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { Copy, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useAITask } from '../hooks/useAITask';
import { useApplications } from '../hooks/useApplications';

export default function CoverLetterModal({ isOpen, onClose, job }) {
  const { startTask, reset, status, result, error } = useAITask();
  const { applications, create } = useApplications();

  useEffect(() => {
    if (isOpen && job) {
      startTask('cover_letter', { jobId: job.id });
    }
    if (!isOpen) reset();
  }, [isOpen, job, startTask, reset]);

  async function handleCopy() {
    await navigator.clipboard.writeText(result?.coverLetter || '');
    toast.success('Cover letter copied');
  }

  // Deliberately a separate, explicit action from generating the cover letter —
  // viewing/copying a cover letter isn't the same as having actually applied on the
  // employer's site, so this should never fire automatically (per the spec's
  // "one-click, but a click" mark-as-applied semantics).
  const alreadyTracked = job && applications.some((a) => a.jobId === job.id);
  function handleMarkApplied() {
    create.mutate(
      { jobId: job.id },
      { onSuccess: () => toast.success('Marked as applied') }
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cover letter — ${job?.title || ''}`}>
      {job && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-inset ring-slate-100">
          <p className="text-xs text-slate-500">
            {alreadyTracked ? 'Already tracked in your Applications list.' : 'Once you\'ve applied on the employer\'s site, mark it here to track it.'}
          </p>
          <Button
            size="sm"
            variant={alreadyTracked ? 'secondary' : 'primary'}
            disabled={alreadyTracked || create.isPending}
            onClick={handleMarkApplied}
          >
            <CheckCircle2 className="h-4 w-4" /> {alreadyTracked ? 'Applied' : 'Mark as Applied'}
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-12 text-slate-500">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand-violet/20" />
            <span className="flex h-14 w-14 items-center justify-center rounded-full btn-gradient">
              <Sparkles className="h-6 w-6 text-white" />
            </span>
          </span>
          <p className="flex items-center text-sm font-medium">
            Crafting your cover letter<span className="ml-1 animate-pulse">…</span>
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
          </div>
          <p className="text-sm font-medium text-rose-600">{error}</p>
          <Button className="mt-1" onClick={() => startTask('cover_letter', { jobId: job.id })}>
            Retry
          </Button>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col gap-4">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/60 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-100">
            {result.coverLetter}
          </pre>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4" /> Copy to clipboard
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
