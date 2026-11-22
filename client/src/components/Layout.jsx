import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, cn } from './ui.jsx';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/reports', label: 'Reports', icon: BarChart3, boss: true },
  { to: '/users', label: 'Users', icon: Users, boss: true },
  { to: '/audit', label: 'Audit log', icon: History, boss: true },
  { to: '/trash', label: 'Trash', icon: Trash2, boss: true }
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function SidebarNav() {
  const { isBoss, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((item) => !item.boss || isBoss);

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          title={label}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-xs font-semibold transition lg:gap-3 lg:px-3 lg:text-sm',
              isActive
                ? 'bg-brand text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={handleSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 lg:gap-3 lg:px-3 lg:text-sm"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">Sign out</span>
      </button>
    </nav>
  );
}

function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center border-b border-slate-100 px-3 lg:px-5">
        <Link to="/dashboard" className="block" aria-label="Robust Warehouse dashboard">
          <img
            src="/logo-horizontal.svg"
            alt="Robust Warehouse Inventory"
            className="h-8 w-auto lg:h-9"
          />
        </Link>
      </div>
      <SidebarNav />
      <div className="hidden border-t border-slate-100 px-5 py-4 lg:block">
        <p className="text-xs font-semibold text-slate-500">Robust Warehouse Inventory</p>
        <p className="mt-0.5 text-[11px] text-slate-400">Purchasing &amp; spending control</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, isBoss, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 w-40 border-r border-line shadow-[1px_0_0_rgba(57,54,95,0.04)] lg:w-72">
        <Sidebar />
      </aside>

      <div className="pl-40 lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="hidden lg:block">
                <p className="text-sm font-semibold text-slate-900">
                  Welcome back, {user?.name?.split(' ')[0] || 'there'}
                </p>
                <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}</p>
              </div>
            </div>

            <div className="relative flex items-center gap-2" ref={menuRef}>
              <Badge tone={isBoss ? 'accent' : 'brand'} className="hidden sm:inline-flex">
                {isBoss ? 'Boss' : 'Staff'}
              </Badge>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-slate-300"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
                  {initials(user?.name) || 'RW'}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-[11rem] truncate text-sm font-semibold text-slate-800">
                    {user?.name}
                  </span>
                  <span className="block max-w-[11rem] truncate text-[11px] text-slate-500">
                    {user?.email}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    role="menuitem"
                  >
                    <UserRound className="h-4 w-4" />
                    Profile &amp; password
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
          <footer className="mt-10 border-t border-line pt-4 text-xs text-slate-400">
            © {new Date().getFullYear()} Robust Warehouse Inventory
          </footer>
        </main>
      </div>
    </div>
  );
}
