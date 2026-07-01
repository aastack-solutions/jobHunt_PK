import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { UploadCloud, X, FileText, AlertTriangle, Plus } from 'lucide-react';
import { QUERY_KEYS } from '../constants/queryKeys';
import { getResume, getResumeHistory, uploadResume, updateSkills } from '../api/resumes';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

export default function Resume() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [skillInput, setSkillInput] = useState('');
  const [dragging, setDragging] = useState(false);

  const { data: resume, isLoading } = useQuery({ queryKey: QUERY_KEYS.RESUMES, queryFn: getResume });
  const { data: history = [] } = useQuery({ queryKey: ['resume-history'], queryFn: getResumeHistory });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.RESUMES });
  const upload = useMutation({ mutationFn: uploadResume, onSuccess: () => { invalidate(); toast.success('Resume uploaded'); } });
  const saveSkills = useMutation({ mutationFn: updateSkills, onSuccess: invalidate });

  function onFile(file) {
    if (file) upload.mutate(file);
  }

  function addSkill(e) {
    e.preventDefault();
    const value = skillInput.trim();
    if (!value || resume.skills.includes(value)) return;
    saveSkills.mutate([...resume.skills, value]);
    setSkillInput('');
  }

  function removeSkill(skill) {
    saveSkills.mutate(resume.skills.filter((s) => s !== skill));
  }

  if (isLoading || !resume) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Resume</h1>
        <p className="text-sm text-slate-500">Upload your CV and fine-tune the skills we match on.</p>
      </div>

      {resume.isImageBased && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-800 backdrop-blur-md">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
          This PDF looks image-based. Skills may not have parsed correctly.
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
        className={`glass cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-all ${
          dragging ? 'border-brand-violet bg-brand-violet/5 scale-[1.01]' : 'border-slate-300/70 hover:border-brand-violet/60'
        }`}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue/15 to-brand-violet/15">
          <UploadCloud className="h-7 w-7 text-brand-violet" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Drag & drop your resume here</p>
        <p className="text-xs text-slate-500">or click to browse · PDF / DOCX</p>
        {upload.isPending && <p className="mt-2 text-xs font-medium text-brand-violet">Uploading…</p>}
        <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => onFile(e.target.files[0])} />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-700">Parsed Skills</h3>
        <div className="flex flex-wrap gap-2">
          {resume.skills.map((skill) => (
            <span key={skill} className="group flex items-center gap-1.5 rounded-xl bg-brand-light px-3 py-1.5 text-xs font-semibold text-brand-blue ring-1 ring-inset ring-brand-blue/10">
              {skill}
              <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}
                className="rounded-full p-0.5 text-brand-blue/60 transition-colors hover:bg-white/60 hover:text-rose-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addSkill} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
              placeholder="Add a skill and press Enter"
              className="w-full rounded-xl bg-white/70 py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none ring-1 ring-inset ring-slate-200 transition-all placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-violet/60" />
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-slate-700">Upload History</h3>
        <ul className="flex flex-col divide-y divide-slate-100/70">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2.5 text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <FileText className="h-4 w-4 text-slate-400" />
                </span>
                {h.fileName}
              </span>
              <span className="text-xs text-slate-400">
                {format(new Date(h.uploadedAt), 'dd MMM yyyy')} · {h.skillCount} skills
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
