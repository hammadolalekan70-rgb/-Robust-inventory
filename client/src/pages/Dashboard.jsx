import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  LockKeyhole,
  Package,
  ReceiptText,
  ShoppingCart,
  Users
} from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import {
  DATE_PRESETS,
  formatDate,
  formatNaira,
  formatNairaCompact,
  rangeForPreset,
  todayISO
} from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  StatCard,
  cn
} from '../components/ui.jsx';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-500">{formatDate(label)}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{formatNaira(payload[0].value)}</p>
      <p className="text-xs text-slate-500">{payload[0].payload.count} purchase(s)</p>
    </div>
  );
}

function RangePicker({ preset, setPreset, from, to, setFrom, setTo }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {DATE_PRESETS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPreset(item.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              preset === item.key
                ? 'bg-brand text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreset('custom')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            preset === 'custom'
              ? 'bg-brand text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          )}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Field label="" className="w-full sm:w-auto">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              max={to || todayISO()}
              onChange={(event) => setFrom(event.target.value)}
              className="w-full py-2 sm:w-40"
            />
          </Field>
          <span className="hidden text-xs font-semibold text-slate-400 sm:inline">to</span>
          <Field label="" className="w-full sm:w-auto">
            <Input
              type="date"
              aria-label="To date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(event) => setTo(event.target.value)}
              className="w-full py-2 sm:w-40"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { user, isBoss } = useAuth();
  const [preset, setPreset] = useState('thisMonth');
  const initial = rangeForPreset('thisMonth');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (preset === 'custom') return;
    const range = rangeForPreset(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api
      .get(`/dashboard${toQuery({ from, to })}`, controller.signal)
      .then((result) => setData(result))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Unable to load the dashboard.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, refreshKey]);

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!unlockCode.trim()) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      await api.post('/dashboard/unlock', { code: unlockCode.trim() });
      setUnlockCode('');
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setUnlockError(err.message || 'Unable to unlock total spend.');
    } finally {
      setUnlocking(false);
    }
  };

  const daily = useMemo(
    () =>
      (data?.daily || []).map((day) => ({
        ...day,
        label: day.date.slice(5)
      })),
    [data]
  );

  const firstName = user?.name?.split(' ')[0] || 'there';
  const spendUnlocked = isBoss || data?.spendUnlocked === true;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Hi ${firstName}, here is the purchasing picture for ${formatDate(from)} – ${formatDate(to)}.`}
        actions={
          <>
            <Button as={Link} to="/reports" variant="secondary">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Button>
            <Button as={Link} to="/purchases/new">
              <ShoppingCart className="h-4 w-4" />
              Record purchase
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <RangePicker
          preset={preset}
          setPreset={setPreset}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
        />
      </div>

      {error ? (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      {loading && !data ? (
        <LoadingBlock label="Loading dashboard…" />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {spendUnlocked ? (
              <StatCard
                label="Total spend"
                value={formatNaira(data.totalKobo)}
                sub={`${formatDate(data.range.from)} – ${formatDate(data.range.to)}`}
                icon={ReceiptText}
                tone="brand"
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total spend
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-[0.18em] text-slate-300">••••••</p>
                    <form onSubmit={handleUnlock} className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={unlockCode}
                        onChange={(event) => {
                          setUnlockCode(event.target.value);
                          setUnlockError('');
                        }}
                        maxLength={8}
                        placeholder="Code"
                        aria-label="Access code to reveal total spend"
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={unlocking || !unlockCode.trim()}
                        loading={unlocking}
                      >
                        Show
                      </Button>
                    </form>
                    {unlockError ? (
                      <p className="mt-1 text-xs font-medium text-rose-600">{unlockError}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Staff access code required</p>
                    )}
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                </div>
              </div>
            )}
            <StatCard
              label="Transactions"
              value={data.transactionCount}
              sub="Purchases recorded in range"
              icon={ShoppingCart}
              tone="emerald"
            />
            <StatCard
              label="Average purchase"
              value={spendUnlocked ? formatNaira(data.averageKobo) : '••••••'}
              sub={spendUnlocked ? 'Spend per transaction' : 'Hidden until unlocked'}
              icon={CalendarRange}
              tone="accent"
            />
            <StatCard
              label="Active records"
              value={`${data.counts.suppliers} / ${data.counts.products}`}
              sub={`Suppliers / products · ${data.counts.staff} staff`}
              icon={Users}
              tone="violet"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Spending trend"
                description="Daily purchase totals across the selected range"
                actions={
                  <Badge tone="brand">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {daily.length} day{daily.length === 1 ? '' : 's'}
                  </Badge>
                }
              />
              <div className="h-72 px-2 pb-4 pt-5 sm:px-4">
                {!spendUnlocked ? (
                  <EmptyState
                    icon={LockKeyhole}
                    title="Spend amounts are locked"
                    description="Enter the access code in the Total spend card to view the spending trend."
                  />
                ) : daily.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => value.slice(5)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        minTickGap={24}
                      />
                      <YAxis
                        tickFormatter={formatNairaCompact}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="totalKobo"
                        stroke="#142B45"
                        strokeWidth={2.5}
                        fill="url(#spendFill)"
                        activeDot={{ r: 4, fill: '#F59E0B', stroke: '#142B45', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No spend in this range" description="Try a wider date range." />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Top suppliers" description="Highest spend in range" />
              <div className="space-y-4 p-5">
                {!spendUnlocked ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-slate-500">
                    <LockKeyhole className="h-4 w-4" />
                    Enter the access code to view supplier spend.
                  </p>
                ) : data.bySupplier.length ? (
                  data.bySupplier.slice(0, 6).map((supplier) => {
                    const max = data.bySupplier[0].totalKobo || 1;
                    return (
                      <div key={supplier.name}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-slate-700">{supplier.name}</span>
                          <span className="shrink-0 font-semibold text-slate-900">
                            {formatNairaCompact(supplier.totalKobo)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(4, (supplier.totalKobo / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">No supplier activity yet.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent purchases"
                description="Latest recorded transactions"
                actions={
                  <Button as={Link} to="/purchases" variant="ghost" size="sm">
                    View all
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                }
              />
              {data.recent.length ? (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Transaction</th>
                        <th>Supplier</th>
                        {spendUnlocked ? <th className="text-right">Total</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((purchase) => (
                        <tr key={purchase.id}>
                          <td className="whitespace-nowrap">{formatDate(purchase.purchaseDate)}</td>
                          <td>
                            <Link
                              to={`/purchases/${purchase.id}`}
                              className="font-semibold text-brand hover:underline"
                            >
                              {purchase.transactionNumber}
                            </Link>
                          </td>
                          <td className="max-w-[14rem] truncate">{purchase.supplier.name}</td>
                          {spendUnlocked ? (
                            <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                              {formatNaira(purchase.totalKobo)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={ReceiptText}
                  title="No purchases recorded"
                  description="Record your first purchase to see it here."
                  action={
                    <Button as={Link} to="/purchases/new">
                      Record purchase
                    </Button>
                  }
                />
              )}
            </Card>

            <Card>
              <CardHeader title="Top products" description="By spend in range" />
              <div className="divide-y divide-slate-100">
                {!spendUnlocked ? (
                  <p className="flex items-center justify-center gap-2 px-5 py-10 text-center text-sm text-slate-500">
                    <LockKeyhole className="h-4 w-4" />
                    Enter the access code to view product spend.
                  </p>
                ) : data.byProduct.length ? (
                  data.byProduct.slice(0, 6).map((product) => (
                    <div key={product.name} className="flex items-start gap-3 px-5 py-3.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          {product.quantity} purchased · {product.count} entr{product.count === 1 ? 'y' : 'ies'}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-900">
                        {formatNairaCompact(product.totalKobo)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">No product activity yet.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
