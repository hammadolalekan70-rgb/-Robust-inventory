import { useCallback, useEffect, useState } from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import {
  ACTION_LABELS,
  actionLabel,
  actionTone,
  formatDateTime,
  ROLE_LABELS
} from '../lib/format.js';
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
  Modal,
  PageHeader,
  Pagination,
  Select
} from '../components/ui.jsx';

const ENTITY_TYPES = ['User', 'Product', 'Supplier', 'Purchase'];
const ACTIONS = Object.keys(ACTION_LABELS);

function ValueBlock({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
      </pre>
    </div>
  );
}

export default function Audit() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .get('/users?limit=100&status=all')
      .then((result) => setUsers(result.items))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [action, entityType, actorId, from, to]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/audit${toQuery({ action, entityType, actorId, from, to, page, limit: 30 })}`)
      .then((result) => setData(result))
      .catch((err) => setError(err.message || 'Unable to load the audit log.'))
      .finally(() => setLoading(false));
  }, [action, entityType, actorId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const filtersActive = Boolean(action || entityType || actorId || from || to);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="An append-only record of sensitive actions. Visible to the boss only."
        actions={
          <Badge tone="accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            Integrity trail
          </Badge>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Action" className="xl:col-span-2">
            <Select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">All actions</option>
              {ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {ACTION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entity">
            <Select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="">All entities</option>
              {ENTITY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actor">
            <Select value={actorId} onChange={(event) => setActorId(event.target.value)}>
              <option value="">Everyone</option>
              {users.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
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
        </div>
        {filtersActive ? (
          <div className="flex justify-end border-t border-slate-100 px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAction('');
                setEntityType('');
                setActorId('');
                setFrom('');
                setTo('');
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Events"
          description={
            data ? `${data.pagination.total} event${data.pagination.total === 1 ? '' : 's'} recorded` : undefined
          }
        />
        {loading ? (
          <LoadingBlock label="Loading audit events…" />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Transaction</th>
                    <th className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((event) => (
                    <tr key={event.id} className="cursor-pointer" onClick={() => setSelected(event)}>
                      <td className="whitespace-nowrap text-slate-600">{formatDateTime(event.createdAt)}</td>
                      <td>
                        <p className="font-medium text-slate-800">{event.actorName || 'System'}</p>
                        <p className="text-xs text-slate-500">
                          {event.actorRole ? ROLE_LABELS[event.actorRole] || event.actorRole : '—'}
                        </p>
                      </td>
                      <td>
                        <Badge tone={actionTone(event.action)}>{actionLabel(event.action)}</Badge>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{event.action}</p>
                      </td>
                      <td className="text-slate-600">{event.entityType || '—'}</td>
                      <td className="font-mono text-xs text-slate-600">{event.transactionNumber || '—'}</td>
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setSelected(event);
                          }}
                        >
                          Details
                        </Button>
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
            title={filtersActive ? 'No events match these filters' : 'No audit events yet'}
            description={
              filtersActive
                ? 'Try clearing the filters or widening the date range.'
                : 'Sensitive actions will appear here as the team uses the system.'
            }
            action={
              filtersActive ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAction('');
                    setEntityType('');
                    setActorId('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? actionLabel(selected.action) : 'Audit event'}
        description={selected ? formatDateTime(selected.createdAt) : ''}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actor</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {selected.actorName || 'System'}
                  {selected.actorRole ? ` · ${ROLE_LABELS[selected.actorRole] || selected.actorRole}` : ''}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entity</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {selected.entityType || '—'}
                  {selected.transactionNumber ? ` · ${selected.transactionNumber}` : ''}
                </p>
                {selected.entityId ? (
                  <p className="mt-0.5 break-all font-mono text-[10px] text-slate-400">{selected.entityId}</p>
                ) : null}
              </div>
              <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</p>
                <p className="mt-1 font-mono text-xs text-slate-700">{selected.action}</p>
              </div>
            </div>

            {selected.field ? (
              <div className="text-sm">
                <span className="text-slate-500">Field changed:</span>{' '}
                <span className="font-semibold text-slate-800">{selected.field}</span>
              </div>
            ) : null}

            <ValueBlock label="Previous value" value={selected.oldValue} />
            <ValueBlock label="New value" value={selected.newValue} />

            <div className="grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-600">IP:</span> {selected.ip || '—'}
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-600">User agent:</span> {selected.userAgent || '—'}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
