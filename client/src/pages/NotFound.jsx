import { Link } from 'react-router-dom';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center">
      <img src="/logo-horizontal.svg" alt="Robust Warehouse Inventory" className="h-10 w-auto" />
      <p className="mt-10 text-sm font-bold uppercase tracking-[0.25em] text-accent">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Button as={Link} to="/dashboard">
          Go to dashboard
        </Button>
        <Button as={Link} to="/" variant="secondary">
          Home
        </Button>
      </div>
    </div>
  );
}
