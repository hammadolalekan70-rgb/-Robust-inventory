import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui.jsx';

export function FullPageLoader({ label = 'Loading your workspace…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

export function ProtectedRoute({ bossOnly = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }
  if (bossOnly && user.role !== 'boss') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function BossOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user?.role !== 'boss') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
