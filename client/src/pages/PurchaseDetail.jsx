import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  History,
  Pencil,
  Phone,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound
} from 'lucide-react';
import { api } from '../lib/api.js';
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatNaira,
  formatQuantity
} from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader
} from '../components/ui.jsx';

function ChangeValue({ field, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">—</span>;
  if (field === 'totalKobo') return <span>{formatNaira(value)}</span>;
  if (typeof value === 'object') {
    if ('quantity' in value) {
      return (
        <span>
          {value.name ? `${value.name} · ` : ''}
          {formatQuantity(value.quantity, value.unitLabel)} @ {formatNaira(value.unitPriceKobo)}
        </span>
      );
    }
    return (
      <span>
        {Object.entries(value)
          .map(([key, entry]) => `${key}: ${entry}`)
          .join(' · ')}
      </span>
    );
  }
  return <span>{String(value)}</span>;
}

export default function PurchaseDetail() {
  const { id } = useParams();
  const { user, isBoss } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [working, setWorking] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState(null);
  const [revisionsError, setRevisionsError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/purchases/${id}`)
      .then((data) => setPurchase(data.purchase))
      .catch((err) => setError(err.message || 'Unable to load this purchase.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openRevisions = async () => {
    setRevisionsOpen(true);
    setRevisions(null);
    setRevisionsError('');
    try {
      const data = await api.get(`/purchases/${id}/revisions`);
      setRevisions(data);
    } catch (err) {
      setRevisionsError(err.message || 'Unable to load the correction history.');
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm.type === 'delete') {
        await api.del(`/purchases/${purchase.id}`);
        toast.success(`${purchase.transactionNumber} moved to trash.`);
        navigate('/purchases', { replace: true });
      } else if (confirm.type === 'restore') {
        const data = await api.post(`/purchases/${purchase.id}/restore`);
        setPurchase(data.purchase);
        toast.success(`${purchase.transactionNumber} restored.`);
        setConfirm(null);
      } else if (confirm.type === 'purge') {
        await api.del(`/purchases/${purchase.id}/permanent`);
        toast.success(`${purchase.transactionNumber} permanently deleted.`);
        navigate('/trash', { replace: true });
      }
    } catch (err) {
      toast.error(err.message || 'The action could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Purchase" />
        <Card>
          <LoadingBlock label="Loading purchase…" />
        </Card>
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div>
        <PageHeader
          title="Purchase"
          actions={
            <Button as={Link} to="/purchases" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to purchases
            </Button>
          }
        />
        <Alert tone="danger" title="Unable to load purchase">
          {error || 'Purchase not found.'}
        </Alert>
      </div>
    );
  }

  const canEdit = !purchase.isDeleted && (isBoss || purchase.recordedBy.id === user?.id);

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/purchases"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to purchases
        </Link>
      </div>

      <PageHeader
        title={purchase.transactionNumber}
        description={`Recorded ${formatDate(purchase.purchaseDate)} by ${purchase.recordedBy.name}`}
        actions={
          <>
            {purchase.isDeleted ? <Badge tone="danger">In trash</Badge> : <Badge tone="success">Active</Badge>}
            {purchase.revisionCount ? (
              <Badge tone="neutral">
                {purchase.revisionCount} correction{purchase.revisionCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {canEdit ? (
              <Button as={Link} to={`/purchases/${purchase.id}/edit`} variant="secondary" size="sm">
                <Pencil className="h-4 w-4" />
                Correct
              </Button>
            ) : null}
            {isBoss && !purchase.isDeleted ? (
              <Button
                variant="dangerGhost"
                size="sm"
                onClick={() => setConfirm({ type: 'delete' })}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
            {isBoss && purchase.isDeleted ? (
              <>
                <Button size="sm" onClick={() => setConfirm({ type: 'restore' })}>
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirm({ type: 'purge' })}>
                  <Trash2 className="h-4 w-4" />
                  Delete forever
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {purchase.isDeleted ? (
        <Alert tone="warning" className="mb-5" title="This purchase is in the trash">
          It is excluded from reports, totals and normal lists. {isBoss ? 'Restore it to make it active again.' : 'Ask the boss to restore it if needed.'}
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Items purchased"
              description={`${purchase.items.length} line${purchase.items.length === 1 ? '' : 's'} · totals calculated by the server`}
            />
            <div className="overflow-x-auto">
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
                      <td className="whitespace-nowrap text-right font-semibold text-slate-900">
                        {formatNaira(item.lineTotalKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                      Purchase total
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-lg font-bold text-slate-900">
                      {formatNaira(purchase.totalKobo)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {purchase.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-slate-600">
                {purchase.notes}
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Attachments"
              description={
                purchase.attachments.length
                  ? `${purchase.attachments.length} file${purchase.attachments.length === 1 ? '' : 's'} attached`
                  : 'No receipts attached to this purchase'
              }
            />
            {purchase.attachments.length ? (
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {purchase.attachments.map((attachment) => {
                  const isImage = attachment.mimeType?.startsWith('image/');
                  return (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-brand/40 hover:shadow-sm"
                    >
                      {isImage ? (
                        <img
                          src={attachment.url}
                          alt={attachment.originalName}
                          className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                          <FileText className="h-6 w-6" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-brand">
                          {attachment.originalName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatFileSize(attachment.size)} · open
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="No receipts"
                description={
                  canEdit ? 'Correct this purchase to attach a receipt.' : 'Nothing was attached when this purchase was recorded.'
                }
                action={
                  canEdit ? (
                    <Button as={Link} to={`/purchases/${purchase.id}/edit`} variant="secondary" size="sm">
                      Add attachment
                    </Button>
                  ) : null
                }
              />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Supplier" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Truck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{purchase.supplier.name}</p>
                  <p className="text-xs text-slate-500">Supplier at time of purchase</p>
                </div>
              </div>
              {purchase.supplier.phone ? (
                <a
                  href={`tel:${purchase.supplier.phone}`}
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-brand"
                >
                  <Phone className="h-4 w-4 text-slate-400" />
                  {purchase.supplier.phone}
                </a>
              ) : null}
              {purchase.supplier.address ? (
                <p className="text-sm leading-relaxed text-slate-600">{purchase.supplier.address}</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Record details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="flex items-center gap-2 text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  Purchase date
                </dt>
                <dd className="text-right font-medium text-slate-800">{formatDate(purchase.purchaseDate)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="flex items-center gap-2 text-slate-500">
                  <UserRound className="h-4 w-4" />
                  Recorded by
                </dt>
                <dd className="text-right font-medium text-slate-800">{purchase.recordedBy.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 px-5 py-3">
                <dt className="flex items-center gap-2 text-slate-500">
                  <ShoppingCart className="h-4 w-4" />
                  Entered
                </dt>
                <dd className="text-right font-medium text-slate-800">{formatDateTime(purchase.createdAt)}</dd>
              </div>
              {purchase.updatedAt && purchase.updatedAt !== purchase.createdAt ? (
                <div className="flex items-start justify-between gap-3 px-5 py-3">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <Pencil className="h-4 w-4" />
                    Last updated
                  </dt>
                  <dd className="text-right font-medium text-slate-800">{formatDateTime(purchase.updatedAt)}</dd>
                </div>
              ) : null}
              {isBoss ? (
                <div className="px-5 py-3">
                  <Button variant="secondary" size="sm" className="w-full" onClick={openRevisions}>
                    <History className="h-4 w-4" />
                    View correction history
                    {purchase.revisionCount ? ` (${purchase.revisionCount})` : ''}
                  </Button>
                </div>
              ) : null}
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        loading={working}
        title={
          confirm?.type === 'purge'
            ? 'Permanently delete this purchase?'
            : confirm?.type === 'restore'
              ? 'Restore this purchase?'
              : 'Move purchase to trash?'
        }
        description={
          confirm?.type === 'purge'
            ? 'This cannot be undone. The purchase, its revisions and its attachment files will be permanently removed.'
            : confirm?.type === 'restore'
              ? 'The purchase will return to active lists, totals and reports.'
              : 'The purchase will be hidden from reports and totals. The boss can restore it from Trash later.'
        }
        confirmLabel={
          confirm?.type === 'purge' ? 'Delete forever' : confirm?.type === 'restore' ? 'Restore' : 'Move to trash'
        }
        tone={confirm?.type === 'purge' ? 'danger' : 'primary'}
      />

      <Modal
        open={revisionsOpen}
        onClose={() => setRevisionsOpen(false)}
        title="Correction history"
        description={`Every change made to ${purchase.transactionNumber}`}
        size="lg"
      >
        {revisionsError ? (
          <Alert tone="danger">{revisionsError}</Alert>
        ) : !revisions ? (
          <LoadingBlock label="Loading corrections…" />
        ) : revisions.revisions.length ? (
          <ol className="space-y-4">
            {revisions.revisions.map((revision) => (
              <li key={revision.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Correction #{revision.revisionNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    {revision.actorName} · {formatDateTime(revision.createdAt)}
                  </p>
                </div>
                {revision.reason ? (
                  <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Reason: {revision.reason}
                  </p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {revision.changes.map((change, index) => (
                    <li key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-slate-700">
                        {change.label || change.field}
                      </p>
                      <p className="mt-1 text-slate-500">
                        <ChangeValue field={change.field} value={change.oldValue} />
                        <span className="mx-2 text-slate-400">→</span>
                        <ChangeValue field={change.field} value={change.newValue} />
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">No corrections have been made.</p>
        )}
      </Modal>
    </div>
  );
}
