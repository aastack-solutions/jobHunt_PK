import { NavLink } from 'react-router';
import { LogOut, Briefcase } from 'lucide-react';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';

const LINKS = [
  { to: ROUTES.HOME, label: 'Dashboard', end: true },
  { to: ROUTES.JOBS, label: 'Jobs' },
  { to: ROUTES.APPLICATIONS, label: 'Applications' },
  { to: ROUTES.AUTO_APPLY, label: 'Auto-Apply' },
  { to: ROUTES.INTERVIEWS, label: 'Interviews' },
  { to: ROUTES.RESUME, label: 'Resume' },
  { to: ROUTES.SETTINGS, label: 'Settings' },
];

function initials(name) {
  if (!name) return 'U';
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="glass-strong mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl btn-gradient shadow-md shadow-brand-violet/30">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-brand-navy">
            JobHunt <span className="text-gradient">PK</span>
          </span>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-brand-navy shadow-sm ring-1 ring-brand-violet/20'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl bg-white/60 py-1 pl-1 pr-3 ring-1 ring-slate-200 sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg btn-gradient text-xs font-bold text-white">
              {initials(user?.fullName)}
            </div>
            <span className="text-sm font-medium text-slate-700">{user?.fullName}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-white/60 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
