import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Paperclip,
  Plus,
  Upload,
  X
} from 'lucide-react';
import { api, apiForm, ApiError } from '../lib/api.js';
import {
  ATTACHMENT_ACCEPT,
  MAX_FILES,
  MAX_UPLOAD_MB,
  computeLineKobo,
  computeTotalKobo,
  formatDate,
  formatFileSize,
  formatNaira,
  koboToInput,
  todayISO
} from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Textarea,
  cn
} from '../components/ui.jsx';

function makeItem(overrides = {}) {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    mode: 'existing',
    productId: '',
    newName: '',
    quantity: '1',
    unitLabel: '',
    unitPrice: '',
    ...overrides
  };
}

const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export default function PurchaseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { isBoss } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [supplierMode, setSupplierMode] = useState('existing');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '' });
  const [items, setItems] = useState([makeItem()]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  const [existingAttachments, setExistingAttachments] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/products?limit=100&status=active'),
      api.get('/suppliers?limit=100&status=active')
    ])
      .then(([productData, supplierData]) => {
        if (cancelled) return;
        setProducts(productData.items);
        setSuppliers(supplierData.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Unable to load directories.');
      })
      .finally(() => {
        if (!cancelled && !isEdit) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setLoading(true);
    api
      .get(`/purchases/${id}`)
      .then(({ purchase }) => {
        if (cancelled) return;
        setPurchaseDate(purchase.purchaseDate);
        setSupplierId(purchase.supplier.id);
        setSupplierMode('existing');
        setNotes(purchase.notes || '');
        setItems(
          purchase.items.map((item) =>
            makeItem({
              mode: 'existing',
              productId: item.productId,
              quantity: item.quantity,
              unitLabel: item.unitLabel || '',
              unitPrice: koboToInput(item.unitPriceKobo)
            })
          )
        );
        setExistingAttachments(purchase.attachments || []);
        setSuppliers((current) =>
          current.some((supplier) => supplier.id === purchase.supplier.id)
            ? current
            : [...current, { id: purchase.supplier.id, name: purchase.supplier.name, isActive: false }]
        );
        setProducts((current) => {
          const next = [...current];
          for (const item of purchase.items) {
            if (!next.some((product) => product.id === item.productId)) {
              next.push({ id: item.productId, name: item.name, isActive: false });
            }
          }
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Unable to load this purchase.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const visibleExisting = existingAttachments.filter((attachment) => !removedIds.includes(attachment.id));
  const totalFiles = visibleExisting.length + files.length;
  const totalKobo = useMemo(() => computeTotalKobo(items), [items]);

  const updateItem = (key, patch) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () => setItems((current) => [...current, makeItem()]);
  const removeItem = (key) =>
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));

  const addFiles = (selected) => {
    const incoming = Array.from(selected || []);
    if (!incoming.length) return;
    const currentCount = visibleExisting.length + files.length;
    const accepted = [];
    let problem = '';
    for (const file of incoming) {
      if (currentCount + accepted.length >= MAX_FILES) {
        problem = `A purchase can have at most ${MAX_FILES} attachments.`;
        break;
      }
      if (!FILE_TYPES.includes(file.type)) {
        problem = `"${file.name}" is not a JPEG, PNG, WebP image or PDF.`;
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        problem = `"${file.name}" is larger than ${MAX_UPLOAD_MB} MB.`;
        continue;
      }
      if (files.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
      accepted.push(file);
    }
    setFileError(problem);
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const buildPayload = (confirmNew = false) => {
    const payload = {
      notes: notes.trim(),
      items: items.map((item) => {
        const shared = {
          quantity: String(item.quantity).trim(),
          unitPrice: String(item.unitPrice).trim(),
          unitLabel: item.unitLabel.trim()
        };
        if (item.mode === 'new') {
          return {
            newProduct: { name: item.newName.trim(), ...(confirmNew ? { confirmNew: true } : {}) },
            ...shared
          };
        }
        return { productId: item.productId, ...shared };
      })
    };

    if (supplierMode === 'new') {
      payload.newSupplier = {
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim(),
        address: newSupplier.address.trim(),
        ...(confirmNew ? { confirmNew: true } : {})
      };
    } else {
      payload.supplierId = supplierId;
    }

    if (isBoss && purchaseDate) payload.purchaseDate = purchaseDate;
    if (isEdit && reason.trim()) payload.reason = reason.trim();
    if (isEdit && removedIds.length) payload.removeAttachmentIds = removedIds;
    return payload;
  };

  const submit = async (confirmNew = false) => {
    setError('');
    setFileError('');
    setFieldErrors({});

    if (!isEdit && !isBoss && supplierMode === 'existing' && !supplierId) {
      setError('Select a supplier or create a new one.');
      return;
    }
    if (supplierMode === 'existing' && !supplierId) {
      setError('Select a supplier or create a new one.');
      return;
    }
    if (supplierMode === 'new' && newSupplier.name.trim().length < 2) {
      setError('Enter the new supplier name.');
      return;
    }
    for (const item of items) {
      if (item.mode === 'existing' && !item.productId) {
        setError('Select a product on every line, or create a new product.');
        return;
      }
      if (item.mode === 'new' && item.newName.trim().length < 2) {
        setError('Enter a name for every new product.');
        return;
      }
      if (computeLineKobo(item.quantity, item.unitPrice) === null) {
        setError('Every line needs a valid quantity (up to 3 decimals) and unit price.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = buildPayload(confirmNew);
      let data;
      if (files.length) {
        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));
        for (const file of files) formData.append('files', file);
        data = await apiForm(isEdit ? `/purchases/${id}` : '/purchases', formData, isEdit ? 'PATCH' : 'POST');
      } else {
        data = isEdit
          ? await api.patch(`/purchases/${id}`, payload)
          : await api.post('/purchases', payload);
      }
      toast.success(
        isEdit
          ? `Purchase ${data.purchase.transactionNumber} corrected.`
          : `Purchase ${data.purchase.transactionNumber} recorded.`
      );
      navigate(`/purchases/${data.purchase.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && ['PRODUCT_DUPLICATE', 'SUPPLIER_DUPLICATE'].includes(err.code)) {
        setDuplicate({
          code: err.code,
          message: err.message,
          matches: err.matches()
        });
      } else if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError(err.message || 'Unable to save the purchase.');
      }
    } finally {
      setSaving(false);
    }
  };

  const onDuplicateConfirm = () => {
    setDuplicate(null);
    submit(true);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Correct purchase' : 'Record purchase'} />
        <Card>
          <LoadingBlock label="Preparing the form…" />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Correct purchase' : 'Record purchase'} />
        <Alert tone="danger" title="Unable to open the form">
          {loadError}
        </Alert>
        <Button as={Link} to="/purchases" variant="secondary" className="mt-4">
          Back to purchases
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Correct purchase' : 'Record purchase'}
        description={
          isEdit
            ? 'Changes create a revision entry in the audit history. Totals are recalculated automatically.'
            : 'Capture the supplier, items, prices and any receipts in one place.'
        }
        actions={
          <Button as={Link} to={isEdit ? `/purchases/${id}` : '/purchases'} variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Button>
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-5" title="Please check the form">
          {error}
        </Alert>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
        className="space-y-5"
      >
        <Card>
          <CardHeader
            title="Purchase details"
            description={isBoss ? 'Set the business date for this purchase.' : "The date is recorded automatically as today."}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field
              label="Purchase date"
              htmlFor="purchase-date"
              hint={isBoss ? undefined : 'Staff cannot backdate purchases.'}
              error={fieldErrors.purchaseDate}
            >
              <Input
                id="purchase-date"
                type="date"
                value={purchaseDate}
                max={todayISO()}
                disabled={!isBoss}
                onChange={(event) => setPurchaseDate(event.target.value)}
              />
            </Field>
            <Field label="Notes" htmlFor="purchase-notes" hint="Optional context, delivery details or invoice references.">
              <Input
                id="purchase-notes"
                value={notes}
                maxLength={500}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Delivered to store 2"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Supplier"
            description="Choose an existing supplier or add a new one. Similar names trigger a warning."
            actions={
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setSupplierMode('existing')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    supplierMode === 'existing' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
                  )}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode('new')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    supplierMode === 'new' ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
                  )}
                >
                  New supplier
                </button>
              </div>
            }
          />
          <div className="p-5">
            {supplierMode === 'existing' ? (
              <Field label="Supplier" htmlFor="supplier" error={fieldErrors.supplierId || fieldErrors.newSupplier}>
                <Select id="supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">Select a supplier…</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.isActive === false ? ' (deactivated)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Supplier name" htmlFor="new-supplier-name" required error={fieldErrors['newSupplier.name']}>
                  <Input
                    id="new-supplier-name"
                    value={newSupplier.name}
                    onChange={(event) => setNewSupplier((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Mama Ngozi Store"
                    maxLength={120}
                  />
                </Field>
                <Field label="Phone" htmlFor="new-supplier-phone" error={fieldErrors['newSupplier.phone']}>
                  <Input
                    id="new-supplier-phone"
                    value={newSupplier.phone}
                    onChange={(event) => setNewSupplier((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="e.g. 0803 000 0000"
                    maxLength={40}
                  />
                </Field>
                <Field label="Address" htmlFor="new-supplier-address" className="sm:col-span-2">
                  <Input
                    id="new-supplier-address"
                    value={newSupplier.address}
                    onChange={(event) => setNewSupplier((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Market, street or warehouse"
                    maxLength={200}
                  />
                </Field>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Items"
            description="Quantity supports up to 3 decimals. Prices are in naira and recalculated on the server."
            actions={
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            }
          />
          <div className="space-y-4 p-5">
            {items.map((item, index) => {
              const lineKobo = computeLineKobo(item.quantity, item.unitPrice);
              const productError = fieldErrors[`items.${index}.productId`] || fieldErrors[`items.${index}.newProduct`];
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Line {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={items.length === 1}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                      <Field label="Product" error={productError}>
                        <Select
                          value={item.mode === 'new' ? '__new__' : item.productId}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === '__new__') {
                              updateItem(item.key, { mode: 'new', productId: '' });
                            } else {
                              updateItem(item.key, { mode: 'existing', productId: value });
                            }
                          }}
                        >
                          <option value="">Select a product…</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                              {product.isActive === false ? ' (deactivated)' : ''}
                            </option>
                          ))}
                          <option value="__new__">＋ Create new product…</option>
                        </Select>
                      </Field>
                      {item.mode === 'new' ? (
                        <Field className="mt-2" error={fieldErrors[`items.${index}.newProduct.name`]}>
                          <Input
                            value={item.newName}
                            onChange={(event) => updateItem(item.key, { newName: event.target.value })}
                            placeholder="New product name"
                            maxLength={120}
                            aria-label={`New product name for line ${index + 1}`}
                          />
                        </Field>
                      ) : null}
                    </div>

                    <div className="lg:col-span-2">
                      <Field label="Quantity" error={fieldErrors[`items.${index}.quantity`]}>
                        <Input
                          value={item.quantity}
                          onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                          inputMode="decimal"
                          placeholder="e.g. 2.5"
                          aria-label={`Quantity for line ${index + 1}`}
                        />
                      </Field>
                    </div>

                    <div className="lg:col-span-2">
                      <Field label="Unit" hint="Optional label">
                        <Input
                          value={item.unitLabel}
                          onChange={(event) => updateItem(item.key, { unitLabel: event.target.value })}
                          placeholder="bag, carton"
                          maxLength={20}
                          aria-label={`Unit label for line ${index + 1}`}
                        />
                      </Field>
                    </div>

                    <div className="lg:col-span-2">
                      <Field label="Unit price (₦)" error={fieldErrors[`items.${index}.unitPrice`]}>
                        <Input
                          value={item.unitPrice}
                          onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`Unit price for line ${index + 1}`}
                        />
                      </Field>
                    </div>

                    <div className="flex items-end lg:col-span-2">
                      <div className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Line total
                        </p>
                        <p className={cn('text-sm font-bold', lineKobo === null ? 'text-slate-400' : 'text-slate-900')}>
                          {lineKobo === null ? '—' : formatNaira(lineKobo)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Attachments"
            description={`Receipts or invoices · up to ${MAX_FILES} files, ${MAX_UPLOAD_MB} MB each (JPEG, PNG, WebP, PDF).`}
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={totalFiles >= MAX_FILES}
              >
                <Upload className="h-4 w-4" />
                Add files
              </Button>
            }
          />
          <div className="p-5">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />

            {fileError ? (
              <Alert tone="warning" className="mb-4">
                {fileError}
              </Alert>
            ) : null}

            {visibleExisting.length || files.length ? (
              <ul className="space-y-2">
                {visibleExisting.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-700">{attachment.originalName}</p>
                        <p className="text-xs text-slate-500">{formatFileSize(attachment.size)} · saved</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemovedIds((current) => [...current, attachment.id])}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-700">{file.name}</p>
                        <p className="text-xs text-slate-500">{formatFileSize(file.size)} · ready to upload</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center transition hover:border-brand/40 hover:bg-brand-soft/40"
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="mt-2 text-sm font-semibold text-slate-700">Click to attach receipts</span>
                <span className="mt-0.5 text-xs text-slate-500">Images or PDF, optional</span>
              </button>
            )}

            {removedIds.length ? (
              <button
                type="button"
                onClick={() => setRemovedIds([])}
                className="mt-3 text-xs font-semibold text-brand hover:underline"
              >
                Undo {removedIds.length} removal{removedIds.length === 1 ? '' : 's'}
              </button>
            ) : null}
          </div>
        </Card>

        {isEdit ? (
          <Card>
            <CardHeader
              title="Correction note"
              description="Explain why this purchase is being changed. The reason is stored with the revision."
            />
            <div className="p-5">
              <Field label="Reason for correction" htmlFor="correction-reason" error={fieldErrors.reason}>
                <Textarea
                  id="correction-reason"
                  rows={2}
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Unit price was entered incorrectly"
                />
              </Field>
            </div>
          </Card>
        ) : null}

        <Card className="sticky bottom-3 z-10 border-brand/20 shadow-lg">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase total</p>
              <p className="text-2xl font-bold tracking-tight text-slate-900">{formatNaira(totalKobo)}</p>
              <p className="text-xs text-slate-500">
                {items.length} line{items.length === 1 ? '' : 's'}
                {isBoss && purchaseDate ? ` · ${formatDate(purchaseDate)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button as={Link} to={isEdit ? `/purchases/${id}` : '/purchases'} variant="secondary">
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {isEdit ? 'Save correction' : 'Record purchase'}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Modal
        open={Boolean(duplicate)}
        onClose={() => setDuplicate(null)}
        title="Possible duplicate detected"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicate(null)}>
              Go back and review
            </Button>
            <Button onClick={onDuplicateConfirm} loading={saving}>
              Create anyway
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning" title={duplicate?.message}>
            Similar records already exist. Select an existing one in the form where possible, or confirm
            that this is genuinely a different record.
          </Alert>
          {duplicate?.matches?.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {duplicate.matches.map((match) => (
                <li key={match.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{match.name}</p>
                    {match.phone || match.address ? (
                      <p className="text-xs text-slate-500">
                        {[match.phone, match.address].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={match.isActive ? 'success' : 'neutral'}>
                    {match.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Creating a duplicate directory entry makes reporting and price history harder to trust.
          </p>
        </div>
      </Modal>
    </div>
  );
}
