import { useCallback, useEffect, useState } from 'react';
import {
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Truck
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

const EMPTY_FORM = { name: '', phone: '', address: '' };

export default function Suppliers() {
  const { isBoss } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
      .get(`/suppliers${toQuery({ q: debounced, status, withUsage: 'true', page, limit: 20 })}`)
      .then((result) => setData(result))
      .catch((err) => setError(err.message || 'Unable to load suppliers.'))
      .finally(() => setLoading(false));
  }, [debounced, status, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => setRefreshKey((key) => key + 1);
  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const closeCreate = () => {
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setFormError('');
    setDuplicate(null);
  };

  const createSupplier = async (confirmNew = false) => {
    setFormError('');
    if (form.name.trim().length < 2) {
      setFormError('Enter a supplier name with at least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post('/suppliers', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        ...(confirmNew ? { confirmNew: true } : {})
      });
      toast.success(`"${result.supplier.name}" added to the supplier directory.`);
      closeCreate();
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SUPPLIER_EXISTS') {
        setDuplicate({
          type: 'exists',
          message: err.message,
          supplierId: err.details?.supplierId,
          isActive: err.details?.isActive
        });
      } else if (err instanceof ApiError && err.code === 'SUPPLIER_DUPLICATE') {
        setDuplicate({ type: 'similar', message: err.message, matches: err.matches() });
      } else {
        setFormError(err.message || 'Unable to create the supplier.');
      }
    } finally {
      setSaving(false);
    }
  };

  const reactivateFromDuplicate = async () => {
    if (!duplicate?.supplierId) return;
    setSaving(true);
    try {
      await api.post(`/suppliers/${duplicate.supplierId}/reactivate`);
      toast.success('Supplier reactivated.');
      closeCreate();
      refresh();
    } catch (err) {
      setFormError(err.message || 'Unable to reactivate the supplier.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (supplier) => {
    setEditing(supplier);
    setEditForm({
      name: supplier.name,
      phone: supplier.phone || '',
      address: supplier.address || ''
    });
    setEditError('');
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      await api.patch(`/suppliers/${editing.id}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim()
      });
      toast.success('Supplier updated.');
      setEditing(null);
      refresh();
    } catch (err) {
      setEditError(err.message || 'Unable to update the supplier.');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      const action = toggling.isActive ? 'deactivate' : 'reactivate';
      await api.post(`/suppliers/${toggling.id}/${action}`);
      toast.success(toggling.isActive ? 'Supplier deactivated.' : 'Supplier reactivated.');
      setToggling(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Unable to update the supplier.');
    } finally {
      setToggleBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Contact details and spending history for everyone you buy from."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New supplier
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
                placeholder="Search by name, phone or address…"
                className="pl-9"
                aria-label="Search suppliers"
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
          <LoadingBlock label="Loading suppliers…" />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th className="hidden md:table-cell">Contact</th>
                    <th>Status</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Total spend</th>
                    <th className="hidden lg:table-cell">Last purchase</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <p className="font-semibold text-slate-900">{supplier.name}</p>
                      </td>
                      <td className="hidden max-w-[14rem] md:table-cell">
                        <p className="truncate text-sm">{supplier.phone || '—'}</p>
                        <p className="truncate text-xs text-slate-500">{supplier.address || ''}</p>
                      </td>
                      <td>
                        <Badge tone={supplier.isActive ? 'success' : 'neutral'}>
                          {supplier.isActive ? 'Active' : 'Deactivated'}
                        </Badge>
                      </td>
                      <td className="text-right">{supplier.usage?.purchaseCount ?? 0}</td>
                      <td className="whitespace-nowrap text-right font-medium text-slate-900">
                        {formatNaira(supplier.usage?.totalKobo || 0)}
                      </td>
                      <td className="hidden whitespace-nowrap lg:table-cell">
                        {supplier.usage?.lastPurchaseAt ? formatDate(supplier.usage.lastPurchaseAt) : '—'}
                      </td>
                      <td className="text-right">
                        {isBoss ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(supplier)}
                              aria-label={`Edit ${supplier.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                supplier.isActive
                                  ? 'text-rose-600 hover:bg-rose-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              )}
                              onClick={() => setToggling(supplier)}
                              aria-label={`${supplier.isActive ? 'Deactivate' : 'Reactivate'} ${supplier.name}`}
                            >
                              {supplier.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">View only</span>
                        )}
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
            icon={Truck}
            title={debounced ? 'No matching suppliers' : 'No suppliers yet'}
            description={
              debounced
                ? 'Try a different search term or status filter.'
                : 'Suppliers are created automatically when you record a purchase, or you can add one now.'
            }
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New supplier
              </Button>
            }
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New supplier"
        description="Similar names are flagged to keep spending reports clean."
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={saving}>
              Cancel
            </Button>
            {duplicate?.type === 'similar' ? (
              <Button onClick={() => createSupplier(true)} loading={saving}>
                Create anyway
              </Button>
            ) : duplicate?.type === 'exists' ? null : (
              <Button onClick={() => createSupplier(false)} loading={saving}>
                Create supplier
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier name" htmlFor="supplier-name" required className="sm:col-span-2">
              <Input
                id="supplier-name"
                autoFocus
                value={form.name}
                maxLength={120}
                onChange={(event) => {
                  updateForm('name', event.target.value);
                  setDuplicate(null);
                }}
                placeholder="e.g. Mama Ngozi Store"
              />
            </Field>
            <Field label="Phone" htmlFor="supplier-phone">
              <Input
                id="supplier-phone"
                value={form.phone}
                maxLength={40}
                onChange={(event) => updateForm('phone', event.target.value)}
                placeholder="0803 000 0000"
              />
            </Field>
            <Field label="Address" htmlFor="supplier-address">
              <Input
                id="supplier-address"
                value={form.address}
                maxLength={200}
                onChange={(event) => updateForm('address', event.target.value)}
                placeholder="Market or street"
              />
            </Field>
          </div>

          {duplicate ? (
            <Alert tone="warning" title={duplicate.message}>
              {duplicate.type === 'exists' ? (
                <div className="mt-2">
                  {!duplicate.isActive && isBoss ? (
                    <Button size="sm" onClick={reactivateFromDuplicate} loading={saving}>
                      Reactivate existing supplier
                    </Button>
                  ) : null}
                </div>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {duplicate.matches.map((match) => (
                    <li key={match.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-amber-900">
                        {match.name}
                        {match.phone ? ` · ${match.phone}` : ''}
                      </span>
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
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit supplier"
        description="Historical purchases keep the supplier details captured at the time of purchase."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={submitEdit} loading={editSaving}>
              Save changes
            </Button>
          </>
        }
      >
        <form onSubmit={submitEdit} className="space-y-4">
          {editError ? <Alert tone="danger">{editError}</Alert> : null}
          <Field label="Supplier name" htmlFor="edit-supplier-name" required>
            <Input
              id="edit-supplier-name"
              required
              value={editForm.name}
              maxLength={120}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="edit-supplier-phone">
              <Input
                id="edit-supplier-phone"
                value={editForm.phone}
                maxLength={40}
                onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="Address" htmlFor="edit-supplier-address">
              <Input
                id="edit-supplier-address"
                value={editForm.address}
                maxLength={200}
                onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))}
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={toggleActive}
        loading={toggleBusy}
        title={toggling?.isActive ? 'Deactivate supplier?' : 'Reactivate supplier?'}
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
