import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import { formatDate, formatDateTime, formatNaira } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination
} from '../components/ui.jsx';

export default function Trash() {
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/purchases${toQuery({ status: 'deleted', q: debounced, page, limit: 20 })}`)
      .then((result) => setData(result))
      .catch((err) => setError(err.message || 'Unable to load the trash.'))
      .finally(() => setLoading(false));
  }, [debounced, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const handleConfirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (target.action === 'restore') {
        await api.post(`/purchases/${target.purchase.id}/restore`);
        toast.success(`${target.purchase.transactionNumber} restored.`);
      } else {
        await api.del(`/purchases/${target.purchase.id}/permanent`);
        toast.success(`${target.purchase.transactionNumber} permanently deleted.`);
      }
      setTarget(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Trash"
        description="Deleted purchases are hidden from reports and totals until restored or permanently removed."
        actions={
          <Button as={Link} to="/purchases" variant="secondary">
            Back to purchases
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="p-4">
          <Field label="Search trash" className="max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Transaction number, supplier, product…"
                className="pl-9"
                aria-label="Search deleted purchases"
              />
            </div>
          </Field>
        </div>
      </Card>

      {error ? (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <Card>
        {loading ? (
          <LoadingBlock label="Loading trash…" />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Purchase date</th>
                    <th>Transaction</th>
                    <th>Supplier</th>
                    <th className="hidden lg:table-cell">Recorded by</th>
                    <th className="text-right">Total</th>
                    <th className="hidden lg:table-cell">Deleted</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/purchases/${purchase.id}`)}
                    >
                      <td className="whitespace-nowrap">{formatDate(purchase.purchaseDate)}</td>
                      <td className="font-semibold text-brand">{purchase.transactionNumber}</td>
                      <td className="max-w-[14rem] truncate">{purchase.supplier.name}</td>
                      <td className="hidden lg:table-cell">{purchase.recordedBy.name}</td>
                      <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                        {formatNaira(purchase.totalKobo)}
                      </td>
                      <td className="hidden whitespace-nowrap text-xs text-slate-500 lg:table-cell">
                        {purchase.deletedAt ? formatDateTime(purchase.deletedAt) : '—'}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:bg-emerald-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTarget({ action: 'restore', purchase });
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTarget({ action: 'purge', purchase });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={data.pagination} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Deleted purchases will appear here. You can restore them or delete them permanently."
            action={
              <Button as={Link} to="/purchases" variant="secondary">
                View purchases
              </Button>
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={handleConfirm}
        loading={busy}
        title={
          target?.action === 'purge'
            ? 'Permanently delete this purchase?'
            : 'Restore this purchase?'
        }
        description={
          target?.action === 'purge'
            ? `${target?.purchase.transactionNumber} and its attachment files will be removed forever. This cannot be undone.`
            : `${target?.purchase.transactionNumber} will return to active purchases, totals and reports.`
        }
        confirmLabel={target?.action === 'purge' ? 'Delete forever' : 'Restore purchase'}
        tone={target?.action === 'purge' ? 'danger' : 'primary'}
      />
    </div>
  );
}
