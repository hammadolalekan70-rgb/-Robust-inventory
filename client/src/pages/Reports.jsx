import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  ReceiptText
} from 'lucide-react';
import { api, downloadFile, toQuery } from '../lib/api.js';
import {
  DATE_PRESETS,
  formatDate,
  formatNaira,
  formatNairaCompact,
  formatQuantity,
  rangeForPreset,
  todayISO
} from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
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
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{formatNaira(payload[0].value)}</p>
      <p className="text-xs text-slate-500">{payload[0].payload.count} purchase(s)</p>
    </div>
  );
}

function RangeBar({ preset, setPreset, from, to, setFrom, setTo }) {
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
              preset === item.key ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
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
            preset === 'custom' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          )}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' ? (
        <div className="flex items-center gap-2">
          <Field label="" className="w-36">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              max={to || todayISO()}
              onChange={(event) => setFrom(event.target.value)}
              className="py-2"
            />
          </Field>
          <span className="text-xs font-semibold text-slate-400">to</span>
          <Field label="" className="w-36">
            <Input
              type="date"
              aria-label="To date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(event) => setTo(event.target.value)}
              className="py-2"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

export default function Reports() {
  const toast = useToast();
  const [preset, setPreset] = useState('thisMonth');
  const initial = rangeForPreset('thisMonth');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tab, setTab] = useState('summary');
  const [granularity, setGranularity] = useState('daily');
  const [summary, setSummary] = useState(null);
  const [detailed, setDetailed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (preset === 'custom') return;
    const range = rangeForPreset(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    const path = tab === 'summary' ? '/reports/summary' : '/reports/detailed';
    api
      .get(`${path}${toQuery({ from, to })}`)
      .then((data) => {
        if (cancelled) return;
        if (tab === 'summary') setSummary(data);
        else setDetailed(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load the report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, tab]);

  const chartData = useMemo(() => {
    if (!summary) return [];
    if (granularity === 'weekly') {
      return summary.weekly.map((entry) => ({
        ...entry,
        label: `Week of ${formatDate(entry.key)}`
      }));
    }
    if (granularity === 'monthly') {
      return summary.monthly.map((entry) => ({
        ...entry,
        label: formatDate(`${entry.key}-01`).replace(/^\d+\s/, '')
      }));
    }
    return summary.daily.map((entry) => ({ ...entry, label: formatDate(entry.date) }));
  }, [summary, granularity]);

  const download = async (kind) => {
    setDownloadError('');
    setDownloading(kind);
    try {
      const file = kind === 'summary' ? '/reports/summary.pdf' : '/reports/detailed.pdf';
      await downloadFile(
        `${file}${toQuery({ from, to })}`,
        `${kind}-report-${from}-to-${to}.pdf`
      );
    } catch (err) {
      setDownloadError(err.message || 'Unable to download the report.');
      toast.error(err.message || 'Unable to download the report.');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Understand where the money went, then export a branded PDF for the records."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => download('summary')}
              loading={downloading === 'summary'}
            >
              <Download className="h-4 w-4" />
              Summary PDF
            </Button>
            <Button
              variant="secondary"
              onClick={() => download('detailed')}
              loading={downloading === 'detailed'}
            >
              <Download className="h-4 w-4" />
              Detailed PDF
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangeBar
          preset={preset}
          setPreset={setPreset}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
        />
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('summary')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-xs font-semibold transition',
              tab === 'summary' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setTab('detailed')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-xs font-semibold transition',
              tab === 'detailed' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            Detailed
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-500">
        Reporting period: <span className="font-semibold text-slate-700">{formatDate(from)}</span> to{' '}
        <span className="font-semibold text-slate-700">{formatDate(to)}</span>
      </p>

      {error || downloadError ? (
        <Alert tone="danger" className="mb-5">
          {error || downloadError}
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <LoadingBlock label="Building report…" />
        </Card>
      ) : tab === 'summary' && summary ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total spend"
              value={formatNaira(summary.totals.totalKobo)}
              sub="Active purchases only"
              icon={ReceiptText}
              tone="brand"
            />
            <StatCard
              label="Transactions"
              value={summary.totals.transactionCount}
              sub="In the reporting period"
              icon={FileSpreadsheet}
              tone="emerald"
            />
            <StatCard
              label="Average purchase"
              value={formatNaira(summary.totals.averageKobo)}
              sub="Spend per transaction"
              icon={FileText}
              tone="accent"
            />
          </div>

          <Card>
            <CardHeader
              title="Spend over time"
              description="Switch between daily, weekly and monthly views"
              actions={
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {['daily', 'weekly', 'monthly'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGranularity(value)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition',
                        granularity === value ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="h-72 px-2 pb-4 pt-5 sm:px-4">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      tickFormatter={formatNairaCompact}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="totalKobo" fill="#142B45" radius={[4, 4, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No spending in this period" description="Try a wider range." />
              )}
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="By supplier" description="Spend and transaction count" />
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="text-right">Purchases</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.bySupplier.length ? (
                      summary.bySupplier.map((supplier) => (
                        <tr key={supplier.name}>
                          <td className="max-w-[14rem] truncate font-medium text-slate-800">{supplier.name}</td>
                          <td className="text-right">{supplier.count}</td>
                          <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                            {formatNaira(supplier.totalKobo)}
                          </td>
                          <td className="text-right text-slate-500">
                            {summary.totals.totalKobo
                              ? `${((supplier.totalKobo / summary.totals.totalKobo) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No supplier activity.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader title="By product" description="Quantity and spend" />
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Entries</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byProduct.length ? (
                      summary.byProduct.map((product) => (
                        <tr key={product.name}>
                          <td className="max-w-[14rem] truncate font-medium text-slate-800">{product.name}</td>
                          <td className="text-right">{product.quantity}</td>
                          <td className="text-right">{product.count}</td>
                          <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                            {formatNaira(product.totalKobo)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No product activity.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="By staff member" description="Who recorded the spending" />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Total spend</th>
                    <th className="text-right">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byStaff.length ? (
                    summary.byStaff.map((member) => (
                      <tr key={member.name}>
                        <td className="font-medium text-slate-800">{member.name || 'Unknown'}</td>
                        <td className="text-right">{member.count}</td>
                        <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                          {formatNaira(member.totalKobo)}
                        </td>
                        <td className="whitespace-nowrap text-right text-slate-600">
                          {formatNaira(Math.round(member.totalKobo / (member.count || 1)))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        No staff activity.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : tab === 'detailed' && detailed ? (
        <Card>
          <CardHeader
            title="Detailed transactions"
            description={`${detailed.transactionCount} purchase${detailed.transactionCount === 1 ? '' : 's'} · ${formatNaira(detailed.totalKobo)} total`}
            actions={
              <Badge tone="brand">
                Showing up to 2,000 transactions
              </Badge>
            }
          />
          {detailed.transactions.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Supplier</th>
                    <th className="hidden lg:table-cell">Recorded by</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {detailed.transactions.map((purchase) => (
                    <TransactionRows
                      key={purchase.id}
                      purchase={purchase}
                      open={expanded === purchase.id}
                      onToggle={() => setExpanded(expanded === purchase.id ? null : purchase.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No transactions"
              description="There are no active purchases in this reporting period."
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function TransactionRows({ purchase, open, onToggle }) {
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="whitespace-nowrap">{formatDate(purchase.purchaseDate)}</td>
        <td>
          <Link
            to={`/purchases/${purchase.id}`}
            onClick={(event) => event.stopPropagation()}
            className="font-semibold text-brand hover:underline"
          >
            {purchase.transactionNumber}
          </Link>
        </td>
        <td className="max-w-[16rem] truncate">{purchase.supplier.name}</td>
        <td className="hidden lg:table-cell">{purchase.recordedBy.name}</td>
        <td className="text-right">{purchase.items.length}</td>
        <td className="whitespace-nowrap text-right font-semibold text-slate-900">
          {formatNaira(purchase.totalKobo)}
        </td>
        <td className="text-right text-slate-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {open ? (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-4">
            <div className="rounded-xl border border-slate-200 bg-white">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th className="text-right">Unit price</th>
                    <th className="text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium text-slate-800">{item.name}</td>
                      <td>{formatQuantity(item.quantity, item.unitLabel)}</td>
                      <td className="whitespace-nowrap text-right">{formatNaira(item.unitPriceKobo)}</td>
                      <td className="whitespace-nowrap text-right font-semibold">
                        {formatNaira(item.lineTotalKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {purchase.notes ? (
                <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                  Notes: {purchase.notes}
                </p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
