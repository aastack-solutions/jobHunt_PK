import { useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { Briefcase, CalendarCheck, TrendingUp, Award } from 'lucide-react';
import { baseChartOptions } from '../lib/chartSetup';
import { chartPalette } from '../theme/colors';
import { useDashboard } from '../hooks/useDashboard';
import { useApplications } from '../hooks/useApplications';
import { useInterviews } from '../hooks/useInterviews';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import StatCard from '../components/StatCard';
import StatusPill from '../components/StatusPill';
import InterviewCard from '../components/InterviewCard';
import SchedulerAlert from '../components/SchedulerAlert';

const TABS = ['Remote', 'Karachi-Onsite', 'Combined'];

function pickSeries(data, tab) {
  if (tab === 'Remote') return data.remote;
  if (tab === 'Karachi-Onsite') return data.karachi;
  return data.remote.map((n, i) => n + data.karachi[i]);
}

const chartOptions = {
  ...baseChartOptions,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { color: chartPalette.tick, font: { family: 'Inter' } } },
    y: { grid: { color: chartPalette.grid }, ticks: { color: chartPalette.tick, font: { family: 'Inter' } } },
  },
};

export default function Dashboard() {
  const [tab, setTab] = useState('Combined');
  const { data, isLoading } = useDashboard();
  const { applications } = useApplications();
  const { interviews } = useInterviews();

  if (isLoading || !data) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  const { stats, funnel, weekly, schedulerLog } = data;
  const funnelData = {
    labels: funnel.labels,
    datasets: [{ label: tab, data: pickSeries(funnel, tab), backgroundColor: chartPalette.violet, borderRadius: 8, maxBarThickness: 38 }],
  };
  const weeklyData = {
    labels: weekly.labels,
    datasets: [{
      label: tab, data: pickSeries(weekly, tab), borderColor: chartPalette.blue,
      backgroundColor: 'rgba(59,111,224,0.12)', fill: true, tension: 0.4,
      pointBackgroundColor: chartPalette.blue, pointRadius: 4,
    }],
  };

  return (
    <div className="flex flex-col gap-6">
      <SchedulerAlert lastRunAt={schedulerLog?.lastRunAt} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Dashboard</h1>
          <p className="text-sm text-slate-500">Track your pipeline across remote and Karachi roles.</p>
        </div>
        <div className="glass flex gap-1 rounded-2xl p-1">
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                tab === t ? 'btn-gradient text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Applications" value={stats.totalApplications} icon={Briefcase} />
        <StatCard label="This Week" value={stats.thisWeek} icon={CalendarCheck} />
        <StatCard label="Interview Rate" value={`${stats.interviewRate}%`} icon={TrendingUp} />
        <StatCard label="Offer Rate" value={`${stats.offerRate}%`} icon={Award} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-bold text-slate-700">Application Funnel</h3>
          <div className="h-64"><Bar data={funnelData} options={chartOptions} /></div>
        </Card>
        <Card>
          <h3 className="mb-4 text-sm font-bold text-slate-700">Weekly Activity</h3>
          <div className="h-64"><Line data={weeklyData} options={chartOptions} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-bold text-slate-700">Recent Applications</h3>
          <ul className="flex flex-col divide-y divide-slate-100/70">
            {applications.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">{a.jobTitle}</p>
                  <p className="truncate text-xs text-slate-400">{a.company}</p>
                </div>
                <StatusPill status={a.status} />
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-700">Upcoming Interviews</h3>
          {interviews.slice(0, 3).map((i) => (
            <InterviewCard key={i.id} interview={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
