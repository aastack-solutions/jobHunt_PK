import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SlidersHorizontal, Wallet, UserCog } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { updatePreferences } from '../api/users';
import { CURRENCIES } from '../constants/currencies';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Toggle from '../components/ui/Toggle';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';

const TIMEZONES = [
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
];

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

      <div className="flex justify-end">
        <Button size="lg" loading={save.isPending} onClick={() => save.mutate(form)}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
