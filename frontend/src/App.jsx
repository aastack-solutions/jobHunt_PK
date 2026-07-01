import { Routes, Route, Navigate, useLocation } from 'react-router';
import { ROUTES } from './constants/routes';
import { useAuth } from './hooks/useAuth';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Spinner from './components/ui/Spinner';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Applications from './pages/Applications';
import Interviews from './pages/Interviews';
import Resume from './pages/Resume';
import Settings from './pages/Settings';

function ProtectedLayout({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }

  return <AppShell>{children}</AppShell>;
}

function Page({ children }) {
  return (
    <ProtectedLayout>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ProtectedLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<ErrorBoundary><Login /></ErrorBoundary>} />
      <Route path={ROUTES.SIGNUP} element={<ErrorBoundary><Signup /></ErrorBoundary>} />
      <Route path={ROUTES.HOME} element={<Page><Dashboard /></Page>} />
      <Route path={ROUTES.JOBS} element={<Page><Jobs /></Page>} />
      <Route path={ROUTES.APPLICATIONS} element={<Page><Applications /></Page>} />
      <Route path={ROUTES.INTERVIEWS} element={<Page><Interviews /></Page>} />
      <Route path={ROUTES.RESUME} element={<Page><Resume /></Page>} />
      <Route path={ROUTES.SETTINGS} element={<Page><Settings /></Page>} />
      <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
    </Routes>
  );
}
