import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router';
import { Briefcase, Sparkles, Globe, MapPin } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../constants/routes';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const HIGHLIGHTS = [
  { Icon: Globe, text: 'Remote jobs from across the globe' },
  { Icon: MapPin, text: 'Onsite & hybrid roles in Karachi' },
  { Icon: Sparkles, text: 'AI-matched scores & cover letters' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  async function onSubmit(values) {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(ROUTES.HOME);
    } catch {
      setFormError('Login failed. Please check your credentials.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] md:grid-cols-2 glass-strong animate-slide-up">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-blue via-brand-violet to-brand-pink p-10 text-white md:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <Briefcase className="h-5 w-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">JobHunt PK</span>
          </div>
          <div>
            <h2 className="text-3xl font-extrabold leading-tight">Your whole job hunt, automated.</h2>
            <ul className="mt-6 space-y-3">
              {HIGHLIGHTS.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm font-medium text-white/90">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/60">Built for small, fast-moving teams.</p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center bg-white/40 p-8 sm:p-10">
          <div className="mb-6 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl btn-gradient shadow-md">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue to your dashboard</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 flex flex-col gap-4">
            <Input label="Email" name="email" type="email" placeholder="you@jobhuntpk.com"
              register={register} error={errors.email?.message} />
            <Input label="Password" name="password" type="password" placeholder="••••••••"
              register={register} error={errors.password?.message} />
            {formError && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
                {formError}
              </p>
            )}
            <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to={ROUTES.SIGNUP} className="font-semibold text-brand-blue hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
