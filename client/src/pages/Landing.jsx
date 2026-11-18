import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  PackageSearch,
  X
} from 'lucide-react';

function FeatureCard({ icon: Icon, title, text, index }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${Math.min(index, 5) * 80}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-[#315B7D]/30 hover:shadow-xl">
        <span className="absolute inset-x-0 top-0 h-1 bg-[#F59E0B] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#315B7D]/10 text-[#315B7D] transition duration-300 group-hover:bg-[#142B45] group-hover:text-white">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mt-5 text-lg font-bold text-[#142B45]">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: PackageSearch,
    title: 'Inventory Tracking',
    text: 'Keep every product, supplier and purchase in one organized record that is easy to search.'
  },
  {
    icon: Boxes,
    title: 'Stock Management',
    text: 'Stay ahead of shortages with clear quantities, item histories and up-to-date stock records.'
  },
  {
    icon: Activity,
    title: 'Real-Time Monitoring',
    text: 'Follow warehouse activity as it happens, so nothing is missed and decisions are never delayed.'
  },
  {
    icon: BarChart3,
    title: 'Reports and Analytics',
    text: 'Turn daily records into clear reports and insights that help you buy smarter and spend better.'
  }
];

const PROBLEMS = [
  {
    problem: 'Receipts, notebooks and chats go missing',
    problemText: 'Spend lives across paper, chats and memory, so purchases can\u2019t be proven or audited.',
    solution: 'Every purchase in one searchable record',
    solutionText: 'Supplier, items, quantities, prices and receipts saved together in one place.'
  },
  {
    problem: 'You can\u2019t tell if a supplier\u2019s price is fair',
    problemText: 'Increases happen quietly and there is no easy history to compare offers.',
    solution: 'Supplier price history at a glance',
    solutionText: 'See how each product\u2019s price changed over time and compare suppliers side by side.'
  },
  {
    problem: 'Monthly reports take hours to build',
    problemText: 'Figures are retyped and reconciled by hand, which is slow and easy to get wrong.',
    solution: 'Reports generated from live records',
    solutionText: 'Daily, weekly and monthly summaries with PDF exports, built from your live records.'
  },
  {
    problem: 'Anyone can change the numbers',
    problemText: 'Without clear roles or a record of edits, mistakes and misuse go unnoticed.',
    solution: 'Boss and Staff roles with a full audit trail',
    solutionText: 'Staff record purchases, sensitive actions stay with the boss, and every change is traceable.'
  }
];

export default function Landing() {
  return (
    <div id="home" className="min-h-screen bg-[#F4F6F8]">
      <section
        className="relative flex min-h-[86vh] flex-col bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/warehouse-hero.jpg')" }}
      >
        <div className="absolute inset-0 bg-[#142B45]/55" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#142B45]/45 via-[#142B45]/10 to-transparent"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#142B45]/50 to-transparent" aria-hidden="true" />

        <header className="relative z-10">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <Link
              to="/"
              className="rounded-xl bg-white/95 px-3 py-1.5 shadow-sm ring-1 ring-white/30 backdrop-blur transition hover:bg-white"
            >
              <img
                src="/logo-horizontal.svg"
                alt="Robust Warehouse"
                className="h-8 w-auto sm:h-9"
              />
            </Link>
            <nav className="flex items-center gap-4 text-xs font-medium text-white/85 sm:gap-8 sm:text-sm">
              <Link to="/" className="transition hover:text-[#F59E0B]">
                Home
              </Link>
              <a href="#features" className="transition hover:text-[#F59E0B]">
                Features
              </a>
              <Link
                to="/login"
                className="rounded-full border border-white/30 px-3.5 py-1.5 transition hover:border-[#F59E0B] hover:bg-white/10 hover:text-white sm:px-4"
              >
                Login
              </Link>
            </nav>
          </div>
        </header>

        <div className="relative z-10 flex flex-1 items-center">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                <span className="h-px w-8 bg-[#F59E0B]" />
                Warehouse inventory management
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Smart Inventory.
                <span className="block text-[#F59E0B]">Smarter Operations.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-100 sm:text-lg">
                Manage your warehouse, track stock levels, monitor products and streamline your
                inventory operations with one powerful inventory management solution.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F59E0B] px-7 text-sm font-semibold text-[#142B45] shadow-lg shadow-[#142B45]/30 transition hover:bg-[#FBBF24] hover:shadow-xl"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/70 hover:bg-white/15"
                >
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section className="relative overflow-hidden bg-[#142B45]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(49,91,125,0.35),_transparent_50%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                Why Robust
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                From scattered records to one clear source of truth.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
                Most warehouses lose money in the gap between what was bought and what was recorded.
                Robust closes that gap.
              </p>
            </div>

            <div className="mt-12 hidden grid-cols-2 gap-5 lg:grid">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                The old way
              </p>
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                The Robust way
              </p>
            </div>

            <div className="mt-4 space-y-4 lg:mt-3">
              {PROBLEMS.map((item) => (
                <div key={item.problem} className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-300">
                        <X className="h-4 w-4" />
                      </span>
                      <h3 className="text-base font-semibold text-slate-200 sm:text-lg">
                        {item.problem}
                      </h3>
                    </div>
                    <p className="mt-3 pl-12 text-sm leading-relaxed text-slate-400">
                      {item.problemText}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#F59E0B]/25 bg-white/[0.08] p-5 shadow-lg shadow-[#081F33]/20 ring-1 ring-inset ring-white/5 backdrop-blur-sm sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[#142B45]">
                        <Check className="h-4 w-4" />
                      </span>
                      <h3 className="text-base font-semibold text-white sm:text-lg">
                        {item.solution}
                      </h3>
                    </div>
                    <p className="mt-3 pl-12 text-sm leading-relaxed text-slate-300">
                      {item.solutionText}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-[#F4F6F8]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                Features
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#142B45] sm:text-4xl">
                Everything You Need to Manage Your Warehouse
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                Four essential tools that keep every item, movement and report under control.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, index) => (
                <FeatureCard key={feature.title} {...feature} index={index} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#142B45]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-300 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
            <Link
              to="/"
              className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-white/90"
            >
              <img
                src="/logo-horizontal.svg"
                alt="Robust Warehouse"
                className="h-7 w-auto"
              />
            </Link>
            <p>© {new Date().getFullYear()} Robust Warehouse · Inventory management</p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-medium">
            <Link to="/privacy" className="transition hover:text-[#F59E0B]">
              Privacy
            </Link>
            <Link to="/terms" className="transition hover:text-[#F59E0B]">
              Terms
            </Link>
            <a href="tel:+2348065931553" className="transition hover:text-[#F59E0B]">
              Contact · 0806 593 1553
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
