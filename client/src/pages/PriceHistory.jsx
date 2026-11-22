import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowLeft, LineChart as LineChartIcon, Package } from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import { formatDate, formatNaira, formatNairaCompact, formatQuantity } from '../lib/format.js';
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
  Pagination,
  Select,
  StatCard
} from '../components/ui.jsx';

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-slate-500">{formatDate(entry.date)}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{formatNaira(entry.unitPriceKobo)}</p>
      <p className="text-xs text-slate-500">{entry.supplierName}</p>
      <p className="text-xs text-slate-500">
        {formatQuantity(entry.quantity)} · {entry.transactionNumber}
      </p>
    </div>
  );
}

export default function PriceHistory() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [productError, setProductError] = useState('');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get(`/products/${id}`)
      .then((data) => setProduct(data.product))
      .catch((err) => setProductError(err.message || 'Unable to load this product.'));
    api
      .get('/suppliers?limit=100&status=active')
      .then((data) => setSuppliers(data.items))
      .catch(() => setSuppliers([]));
  }, [id]);

  useEffect(() => {
    setPage(1);
  }, [from, to, supplierId]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/products/${id}/price-history${toQuery({ from, to, supplierId, page, limit: 20 })}`)
      .then((data) => setHistory(data))
      .catch((err) => setError(err.message || 'Unable to load price history.'))
      .finally(() => setLoading(false));
  }, [id, from, to, supplierId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = history
    ? [...history.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    : [];

  if (productError) {
    return (
      <div>
        <PageHeader title="Price history" />
        <Alert tone="danger" title="Unable to load product">
          {productError}
        </Alert>
        <Button as={Link} to="/products" variant="secondary" className="mt-4">
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </Link>
      </div>

      <PageHeader
        title={product?.name || 'Price history'}
        description="Unit prices captured across all purchases. Use this to spot inflation and compare suppliers."
        actions={
          product ? (
            <Badge tone={product.isActive ? 'success' : 'neutral'}>
              {product.isActive ? 'Active product' : 'Deactivated'}
            </Badge>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setFrom('');
                setTo('');
                setSupplierId('');
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      {loading && !history ? (
        <Card>
          <LoadingBlock label="Loading price history…" />
        </Card>
      ) : history ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Latest price"
              value={history.stats.lastKobo === null ? '—' : formatNaira(history.stats.lastKobo)}
              sub={history.stats.lastDate ? `on ${formatDate(history.stats.lastDate)}` : 'No purchases yet'}
              icon={LineChartIcon}
              tone="brand"
            />
            <StatCard
              label="Lowest price"
              value={history.stats.minKobo === null ? '—' : formatNaira(history.stats.minKobo)}
              sub={`${history.stats.count} entr${history.stats.count === 1 ? 'y' : 'ies'} in range`}
              icon={Package}
              tone="emerald"
            />
            <StatCard
              label="Highest price"
              value={history.stats.maxKobo === null ? '—' : formatNaira(history.stats.maxKobo)}
              sub="Across suppliers"
              icon={LineChartIcon}
              tone="accent"
            />
            <StatCard
              label="Average price"
              value={history.stats.avgKobo === null ? '—' : formatNaira(history.stats.avgKobo)}
              sub="Weighted by entry count"
              icon={LineChartIcon}
              tone="violet"
            />
          </div>

          <Card>
            <CardHeader
              title="Price movement"
              description="Unit price per purchase line in the selected range"
            />
            <div className="h-72 px-2 pb-4 pt-5 sm:px-4">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#142B45" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#142B45" stopOpacity={0.02} />
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
                    <Tooltip content={<PriceTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="unitPriceKobo"
                      stroke="#142B45"
                      strokeWidth={2.5}
                      fill="url(#priceFill)"
                      activeDot={{ r: 4, fill: '#F59E0B', stroke: '#142B45', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No price entries"
                  description="No purchases match these filters for this product."
                />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Purchase history"
              description={`${history.pagination.total} matching line${history.pagination.total === 1 ? '' : 's'}`}
            />
            {history.entries.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Quantity</th>
                        <th className="text-right">Unit price</th>
                        <th className="text-right">Line total</th>
                        <th>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.entries.map((entry) => (
                        <tr key={`${entry.purchaseId}-${entry.transactionNumber}-${entry.date}`}>
                          <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                          <td className="max-w-[14rem] truncate">{entry.supplierName}</td>
                          <td>{formatQuantity(entry.quantity)}</td>
                          <td className="whitespace-nowrap text-right font-medium text-slate-900">
                            {formatNaira(entry.unitPriceKobo)}
                          </td>
                          <td className="whitespace-nowrap text-right">{formatNaira(entry.lineTotalKobo)}</td>
                          <td>
                            <Link
                              to={`/purchases/${entry.purchaseId}`}
                              className="font-semibold text-brand hover:underline"
                            >
                              {entry.transactionNumber}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={history.pagination} onPage={setPage} />
              </>
            ) : (
              <EmptyState title="No matching purchase lines" description="Try clearing the filters." />
            )}
          </Card>

          {history.bySupplier.length ? (
            <Card>
              <CardHeader title="Supplier comparison" description="Within the selected range" />
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th className="text-right">Entries</th>
                      <th className="text-right">Lowest</th>
                      <th className="text-right">Average</th>
                      <th className="text-right">Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.bySupplier.map((supplier) => (
                      <tr key={supplier.supplierName}>
                        <td className="font-medium text-slate-800">{supplier.supplierName}</td>
                        <td className="text-right">{supplier.count}</td>
                        <td className="whitespace-nowrap text-right">{formatNaira(supplier.minKobo)}</td>
                        <td className="whitespace-nowrap text-right">{formatNaira(supplier.avgKobo)}</td>
                        <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                          {formatNaira(supplier.lastKobo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
