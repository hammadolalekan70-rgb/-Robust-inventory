import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Eye,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import { formatDate, formatNaira, todayISO } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  Select
} from '../components/ui.jsx';

const EMPTY_FILTERS = {
  from: '',
  to: '',
  supplierId: '',
  productId: '',
  staffId: '',
  status: 'active',
  sort: 'purchaseDate',
  order: 'desc'
};

export default function Purchases() {
  const { isBoss } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({ products: [], suppliers: [], staff: [] });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  useEffect(() => {
    Promise.all([
      api.get('/products?limit=100&status=active').catch(() => ({ items: [] })),
      api.get('/suppliers?limit=100&status=active').catch(() => ({ items: [] })),
      isBoss ? api.get('/users?limit=100&status=active').catch(() => ({ items: [] })) : Promise.resolve({ items: [] })
    ]).then(([products, suppliers, staff]) => {
      setOptions({ products: products.items, suppliers: suppliers.items, staff: staff.items });
    });
  }, [isBoss]);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    const query = toQuery({
      ...filters,
      q: debouncedSearch,
      page,
      limit: 20
    });
    api
      .get(`/purchases${query}`)
      .then((data) => {
        if (id === requestId.current) setResult(data);
      })
      .catch((err) => {
        if (id === requestId.current) setError(err.message || 'Unable to load purchases.');
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [filters, debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === 'status') return isBoss && value !== 'active';
      if (key === 'sort') return value !== 'purchaseDate';
      if (key === 'order') return value !== 'desc';
      return Boolean(value);
    }).length + (debouncedSearch ? 1 : 0);
  }, [filters, debouncedSearch, isBoss]);

  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/purchases/${toDelete.id}`);
      toast.success(`${toDelete.transactionNumber} moved to trash.`);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Unable to delete the purchase.');
    } finally {
      setDeleting(false);
    }
  };

  const sortValue = `${filters.sort}:${filters.order}`;

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Every purchase recorded by your team, newest first."
        actions={
          <Button as={Link} to="/purchases/new">
            <Plus className="h-4 w-4" />
            Record purchase
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search" htmlFor="purchase-search" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="purchase-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Transaction number, supplier, product, notes…"
                className="pl-9"
              />
            </div>
          </Field>

          <Field label="From" htmlFor="purchase-from">
            <Input
              id="purchase-from"
              type="date"
              value={filters.from}
              max={filters.to || todayISO()}
              onChange={(event) => update('from', event.target.value)}
            />
          </Field>

          <Field label="To" htmlFor="purchase-to">
            <Input
              id="purchase-to"
              type="date"
              value={filters.to}
              min={filters.from}
              max={todayISO()}
              onChange={(event) => update('to', event.target.value)}
            />
          </Field>

          <Field label="Supplier">
            <Select value={filters.supplierId} onChange={(event) => update('supplierId', event.target.value)}>
              <option value="">All suppliers</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Product">
            <Select value={filters.productId} onChange={(event) => update('productId', event.target.value)}>
              <option value="">All products</option>
              {options.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>

          {isBoss ? (
            <>
              <Field label="Recorded by">
                <Select value={filters.staffId} onChange={(event) => update('staffId', event.target.value)}>
                  <option value="">Everyone</option>
                  {options.staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={filters.status} onChange={(event) => update('status', event.target.value)}>
                  <option value="active">Active</option>
                  <option value="deleted">In trash</option>
                  <option value="all">All</option>
                </Select>
              </Field>
            </>
          ) : null}

          <Field label="Sort">
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Select
                value={sortValue}
                onChange={(event) => {
                  const [sort, order] = event.target.value.split(':');
                  setFilters((current) => ({ ...current, sort, order }));
                }}
                className="pl-9"
              >
                <option value="purchaseDate:desc">Newest first</option>
                <option value="purchaseDate:asc">Oldest first</option>
                <option value="totalKobo:desc">Highest amount</option>
                <option value="totalKobo:asc">Lowest amount</option>
                <option value="createdAt:desc">Recently entered</option>
              </Select>
            </div>
          </Field>
        </div>

        {activeFilterCount ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600">
            <span>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <Card>
        {loading ? (
          <LoadingBlock label="Loading purchases…" />
        ) : result?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Supplier</th>
                    <th className="hidden lg:table-cell">Items</th>
                    <th className="hidden xl:table-cell">Recorded by</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/purchases/${purchase.id}`)}
                    >
                      <td className="whitespace-nowrap">{formatDate(purchase.purchaseDate)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-brand">{purchase.transactionNumber}</span>
                          {purchase.isDeleted ? <Badge tone="danger">Trashed</Badge> : null}
                          {purchase.revisionCount ? (
                            <Badge tone="neutral">Edited</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[16rem] truncate">{purchase.supplier.name}</td>
                      <td className="hidden lg:table-cell">
                        <span className="text-slate-600">
                          {purchase.items.length} line{purchase.items.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="hidden xl:table-cell">{purchase.recordedBy.name}</td>
                      <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                        {formatNaira(purchase.totalKobo)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            as={Link}
                            to={`/purchases/${purchase.id}`}
                            variant="ghost"
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`View ${purchase.transactionNumber}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isBoss && !purchase.isDeleted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                setToDelete(purchase);
                              }}
                              aria-label={`Delete ${purchase.transactionNumber}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={result.pagination} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={activeFilterCount ? 'No matching purchases' : 'No purchases yet'}
            description={
              activeFilterCount
                ? 'Try clearing some filters or widening the date range.'
                : 'Record the first purchase to start building your spending history.'
            }
            action={
              activeFilterCount ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button as={Link} to="/purchases/new">
                  Record purchase
                </Button>
              )
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Move purchase to trash?"
        description={
          toDelete
            ? `${toDelete.transactionNumber} will be hidden from reports and totals. The boss can restore it from Trash later.`
            : ''
        }
        confirmLabel="Move to trash"
      />
    </div>
  );
}
