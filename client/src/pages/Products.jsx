import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  History,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search
} from 'lucide-react';
import { api, ApiError, toQuery } from '../lib/api.js';
import { formatDate, formatNaira } from '../lib/format.js';
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
  Modal,
  PageHeader,
  Pagination,
  Select,
  cn
} from '../components/ui.jsx';

export default function Products() {
  const { isBoss } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renamingBusy, setRenamingBusy] = useState(false);

  const [toggling, setToggling] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, status]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/products${toQuery({ q: debounced, status, withUsage: 'true', page, limit: 20 })}`)
      .then((result) => setData(result))
      .catch((err) => setError(err.message || 'Unable to load products.'))
      .finally(() => setLoading(false));
  }, [debounced, status, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateName('');
    setCreateError('');
    setDuplicate(null);
  };

  const createProduct = async (confirmNew = false) => {
    setCreateError('');
    if (createName.trim().length < 2) {
      setCreateError('Enter a product name with at least 2 characters.');
      return;
    }
    setCreating(true);
    try {
      const result = await api.post('/products', {
        name: createName.trim(),
        ...(confirmNew ? { confirmNew: true } : {})
      });
      toast.success(`"${result.product.name}" added to the product directory.`);
      closeCreate();
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRODUCT_EXISTS') {
        setDuplicate({
          type: 'exists',
          message: err.message,
          productId: err.details?.productId,
          isActive: err.details?.isActive
        });
      } else if (err instanceof ApiError && err.code === 'PRODUCT_DUPLICATE') {
        setDuplicate({ type: 'similar', message: err.message, matches: err.matches() });
      } else {
        setCreateError(err.message || 'Unable to create the product.');
      }
    } finally {
      setCreating(false);
    }
  };

  const reactivateFromDuplicate = async () => {
    if (!duplicate?.productId) return;
    setCreating(true);
    try {
      await api.post(`/products/${duplicate.productId}/reactivate`);
      toast.success('Product reactivated.');
      closeCreate();
      refresh();
    } catch (err) {
      setCreateError(err.message || 'Unable to reactivate the product.');
    } finally {
      setCreating(false);
    }
  };

  const openRename = (product) => {
    setRenaming(product);
    setRenameValue(product.name);
    setRenameError('');
  };

  const submitRename = async (event) => {
    event.preventDefault();
    setRenameError('');
    setRenamingBusy(true);
    try {
      await api.patch(`/products/${renaming.id}`, { name: renameValue.trim() });
      toast.success('Product renamed.');
      setRenaming(null);
      refresh();
    } catch (err) {
      setRenameError(err.message || 'Unable to rename the product.');
    } finally {
      setRenamingBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      const action = toggling.isActive ? 'deactivate' : 'reactivate';
      await api.post(`/products/${toggling.id}/${action}`);
      toast.success(toggling.isActive ? 'Product deactivated.' : 'Product reactivated.');
      setToggling(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Unable to update the product.');
    } finally {
      setToggleBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="The product directory used for purchase lines, price history and reports."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New product
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Search" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the product directory…"
                className="pl-9"
                aria-label="Search products"
              />
            </div>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
              <option value="all">All</option>
            </Select>
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
          <LoadingBlock label="Loading products…" />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Status</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Total spend</th>
                    <th className="hidden lg:table-cell">Last purchase</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((product) => (
                    <tr
                      key={product.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/products/${product.id}`)}
                    >
                      <td>
                        <span className="font-semibold text-slate-900">{product.name}</span>
                      </td>
                      <td>
                        <Badge tone={product.isActive ? 'success' : 'neutral'}>
                          {product.isActive ? 'Active' : 'Deactivated'}
                        </Badge>
                      </td>
                      <td className="text-right">{product.usage?.purchaseCount ?? 0}</td>
                      <td className="whitespace-nowrap text-right font-medium text-slate-900">
                        {formatNaira(product.usage?.totalKobo || 0)}
                      </td>
                      <td className="hidden whitespace-nowrap lg:table-cell">
                        {product.usage?.lastPurchaseAt ? formatDate(product.usage.lastPurchaseAt) : '—'}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            as={Link}
                            to={`/products/${product.id}`}
                            variant="ghost"
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`View price history for ${product.name}`}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {isBoss ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openRename(product);
                                }}
                                aria-label={`Rename ${product.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  product.isActive
                                    ? 'text-rose-600 hover:bg-rose-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setToggling(product);
                                }}
                                aria-label={`${product.isActive ? 'Deactivate' : 'Reactivate'} ${product.name}`}
                              >
                                {product.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                              </Button>
                            </>
                          ) : null}
                          <ArrowUpRight className="ml-1 hidden h-4 w-4 text-slate-300 sm:block" />
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
            icon={History}
            title={debounced ? 'No matching products' : 'No products yet'}
            description={
              debounced
                ? 'Try a different search term or status filter.'
                : 'Products are created automatically when you record a purchase, or you can add one now.'
            }
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New product
              </Button>
            }
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New product"
        description="Similar names are flagged to keep price history reliable."
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={creating}>
              Cancel
            </Button>
            {duplicate?.type === 'similar' ? (
              <Button onClick={() => createProduct(true)} loading={creating}>
                Create anyway
              </Button>
            ) : duplicate?.type === 'exists' ? null : (
              <Button onClick={() => createProduct(false)} loading={creating}>
                Create product
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {createError ? <Alert tone="danger">{createError}</Alert> : null}
          <Field label="Product name" htmlFor="product-name" required>
            <Input
              id="product-name"
              autoFocus
              value={createName}
              maxLength={120}
              onChange={(event) => {
                setCreateName(event.target.value);
                setDuplicate(null);
              }}
              placeholder="e.g. Long grain rice"
            />
          </Field>

          {duplicate ? (
            <Alert tone="warning" title={duplicate.message}>
              {duplicate.type === 'exists' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    as={Link}
                    to={`/products/${duplicate.productId}`}
                    variant="secondary"
                    size="sm"
                    onClick={closeCreate}
                  >
                    View existing product
                  </Button>
                  {!duplicate.isActive && isBoss ? (
                    <Button size="sm" onClick={reactivateFromDuplicate} loading={creating}>
                      Reactivate it
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {duplicate.matches.map((match) => (
                    <li key={match.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-amber-900">{match.name}</span>
                      <Badge tone={match.isActive ? 'success' : 'neutral'}>
                        {match.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename product"
        description="Historical purchases keep the product name captured at the time of purchase."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)} disabled={renamingBusy}>
              Cancel
            </Button>
            <Button onClick={submitRename} loading={renamingBusy}>
              Save name
            </Button>
          </>
        }
      >
        <form onSubmit={submitRename} className="space-y-4">
          {renameError ? <Alert tone="danger">{renameError}</Alert> : null}
          <Field label="Product name" htmlFor="rename-product" required>
            <Input
              id="rename-product"
              autoFocus
              value={renameValue}
              maxLength={120}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={toggleActive}
        loading={toggleBusy}
        title={toggling?.isActive ? 'Deactivate product?' : 'Reactivate product?'}
        description={
          toggling?.isActive
            ? `"${toggling?.name}" will disappear from new purchase forms. Historical purchases and reports are unchanged.`
            : `"${toggling?.name}" will be available again when recording purchases.`
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.isActive ? 'danger' : 'primary'}
      />
    </div>
  );
}
