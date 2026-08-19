import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { SlidersHorizontal, Wallet, UserCog, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { updatePreferences } from '../api/users';
import { getApplyCredentials, upsertApplyCredential, deleteApplyCredential } from '../api/applyBot';
import { CURRENCIES } from '../constants/currencies';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const TIMEZONES = [
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
];

// Mirrors PLATFORMS in backend/src/routes/applyCredentials.js — the API rejects
// anything else, so these must stay in step.
const APPLY_PLATFORMS = [
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'generic', label: 'Other (generic)', note: 'Not used yet — the generic engine stays switched off.' },
];

const credentialSchema = z.object({
  username: z.string().min(1, 'Username or email is required').max(300),
  password: z.string().min(1, 'Password is required').max(500),
  // Only meaningful for a custom login; blank is fine and is sent as omitted.
  loginUrl: z.union([z.string().url('Enter a valid URL'), z.literal('')]).optional(),
});

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue/15 to-brand-violet/15">
        <Icon className="h-4.5 w-4.5 text-brand-violet" />
      </span>
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
    </div>
  );
}

// F11 — per-platform ApplyCredential CRUD. Lives inside Settings.jsx because the
// plan's file manifest says so ("no new page for F11 — the credential form lives
// inside Settings.jsx").
//
// The one rule that shapes the whole UI: the API never returns a stored secret, by
// design (applyCredentials.js's publicCredential strips every encrypted field). So
// there is no "edit" that pre-fills anything — saving always means typing a fresh
// username and password, which replaces what is stored.
function ApplyCredentialsCard() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null); // { mode: 'save' | 'delete', platform }

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ['applyCredentials'],
    queryFn: getApplyCredentials,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(credentialSchema), defaultValues: { username: '', password: '', loginUrl: '' } });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['applyCredentials'] });

  const save = useMutation({
    mutationFn: ({ platform, values }) =>
      upsertApplyCredential(platform, {
        username: values.username,
        password: values.password,
        ...(values.loginUrl ? { loginUrl: values.loginUrl } : {}),
      }),
    onSuccess: (_data, { platform }) => {
      toast.success(`${labelFor(platform)} credential saved`);
      closeDialog();
      invalidate();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Could not save that credential'),
  });

  const remove = useMutation({
    mutationFn: (platform) => deleteApplyCredential(platform),
    onSuccess: (_data, platform) => {
      toast.success(`${labelFor(platform)} credential deleted`);
      closeDialog();
      invalidate();
    },
    onError: () => toast.error('Could not delete that credential'),
  });

  function closeDialog() {
    setDialog(null);
    reset();
  }

  const byPlatform = Object.fromEntries(credentials.map((c) => [c.platform, c]));

  return (
    <Card className="flex flex-col gap-5">
      <SectionHeader icon={KeyRound} title="Auto-Apply Credentials" />
      <p className="-mt-2 text-xs text-slate-500">
        Logins the auto-apply bot signs in with to fill applications on your behalf. Passwords are encrypted before
        they are stored and are never shown again — not even here.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {APPLY_PLATFORMS.map(({ value, label, note }) => {
            const credential = byPlatform[value];
            return (
              <div key={value} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                    {credential ? (
                      <Badge color="bg-emerald-50 text-emerald-700 ring-emerald-200">Saved</Badge>
                    ) : (
                      <Badge>Not set</Badge>
                    )}
                    {credential?.hasSessionState && (
                      <Badge color="bg-sky-50 text-sky-700 ring-sky-200">
                        <ShieldCheck className="h-3 w-3" /> Session reused
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    {note || (credential ? 'Signed in as a saved account — password hidden.' : 'The bot will skip this platform until a login is saved.')}
                  </span>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setDialog({ mode: 'save', platform: value })}>
                    {credential ? 'Replace' : 'Add'}
                  </Button>
                  {credential && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'delete', platform: value })}>
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={dialog?.mode === 'save'}
        onClose={closeDialog}
        title={`${byPlatform[dialog?.platform] ? 'Replace' : 'Add'} ${labelFor(dialog?.platform)} login`}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => save.mutate({ platform: dialog.platform, values }))}
        >
          {byPlatform[dialog?.platform] && (
            <p className="rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
              A login is already saved for {labelFor(dialog?.platform)}. Saving here replaces it — the existing password
              cannot be shown, only overwritten.
            </p>
          )}
          <Input label="Username or email" name="username" autoComplete="off" register={register} error={errors.username?.message} />
          <Input label="Password" name="password" type="password" autoComplete="new-password" register={register} error={errors.password?.message} />
          {dialog?.platform === 'generic' && (
            <Input label="Login URL (optional)" name="loginUrl" placeholder="https://…" register={register} error={errors.loginUrl?.message} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button type="submit" loading={isSubmitting || save.isPending}>Save login</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={dialog?.mode === 'delete'} onClose={closeDialog} title={`Delete ${labelFor(dialog?.platform)} login`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            The bot will stop applying to {labelFor(dialog?.platform)} jobs entirely — with no login on file it skips
            that platform rather than guessing. Any saved browser session is deleted too.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(dialog.platform)}>
              Delete login
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function labelFor(platform) {
  return APPLY_PLATFORMS.find((p) => p.value === platform)?.label || platform || '';
}

export default function Settings() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (user) setForm(user);
  }, [user]);

  const save = useMutation({
    mutationFn: updatePreferences,
    onSuccess: () => toast.success('Preferences saved'),
  });

  if (!form) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Settings</h1>
        <p className="text-sm text-slate-500">Tune what we look for and how we reach you.</p>
      </div>

      <Card className="flex flex-col gap-5">
        <SectionHeader icon={SlidersHorizontal} title="Job Preferences" />
        <Toggle label="Remote jobs" description="Match remote roles from global platforms"
          checked={form.wantsRemote} onChange={(v) => update('wantsRemote', v)} />
        <div className="h-px bg-slate-100" />
        <Toggle label="Karachi-Onsite jobs" description="Match onsite & hybrid roles in Karachi"
          checked={form.wantsOnsiteKarachi} onChange={(v) => update('wantsOnsiteKarachi', v)} />
        <Input label="Home area" name="homeArea" value={form.homeArea || ''} onChange={(e) => update('homeArea', e.target.value)} />
        <p className="-mt-3 text-xs text-slate-500">
          Used for distance sorting via OpenStreetMap — optional and approximate
        </p>
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHeader icon={Wallet} title="Salary Expectations" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Minimum" name="salaryMin" type="number" value={form.salaryMin} onChange={(e) => update('salaryMin', Number(e.target.value))} />
          <Input label="Maximum" name="salaryMax" type="number" value={form.salaryMax} onChange={(e) => update('salaryMax', Number(e.target.value))} />
          <Select label="Currency" name="salaryCurrency" options={CURRENCIES} value={form.salaryCurrency} onChange={(e) => update('salaryCurrency', e.target.value)} />
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHeader icon={UserCog} title="Account" />
        <Select label="Timezone" name="timezone" options={TIMEZONES} value={form.timezone} onChange={(e) => update('timezone', e.target.value)} />
      </Card>

      <ApplyCredentialsCard />

      <div className="flex justify-end">
        <Button size="lg" loading={save.isPending} onClick={() => save.mutate(form)}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
