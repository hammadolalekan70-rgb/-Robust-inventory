import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { api, toQuery } from '../lib/api.js';
import { actionLabel, formatDate, formatDateTime, formatNaira, ROLE_LABELS } from '../lib/format.js';
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
  StatCard,
  cn
} from '../components/ui.jsx';

const EMPTY_CREATE = { name: '', email: '', password: '', role: 'staff' };

export default function Users() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'staff' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const [toggling, setToggling] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const [activityUser, setActivityUser] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, role, status]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/users${toQuery({ q: debounced, role, status, page, limit: 20 })}`)
      .then((result) => setData(result))
      .catch((err) => setError(err.message || 'Unable to load users.'))
      .finally(() => setLoading(false));
  }, [debounced, role, status, page, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateForm(EMPTY_CREATE);
    setCreateError('');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.post('/users', {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role
      });
      toast.success('User account created.');
      closeCreate();
      refresh();
    } catch (err) {
      setCreateError(err.message || 'Unable to create the user.');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (member) => {
    setEditing(member);
    setEditForm({ name: member.name, email: member.email, role: member.role });
    setEditError('');
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      await api.patch(`/users/${editing.id}`, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role
      });
      toast.success('User updated.');
      setEditing(null);
      refresh();
    } catch (err) {
      setEditError(err.message || 'Unable to update the user.');
    } finally {
      setEditSaving(false);
    }
  };

  const openReset = (member) => {
    setResetting(member);
    setNewPassword('');
    setResetError('');
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setResetError('');
    setResetSaving(true);
    try {
      await api.post(`/users/${resetting.id}/password`, { password: newPassword });
      toast.success(`Password reset for ${resetting.name}. They must sign in again.`);
      setResetting(null);
    } catch (err) {
      setResetError(err.message || 'Unable to reset the password.');
    } finally {
      setResetSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!toggling) return;
    setToggleBusy(true);
    try {
      const action = toggling.isActive ? 'deactivate' : 'reactivate';
      await api.post(`/users/${toggling.id}/${action}`);
      toast.success(toggling.isActive ? 'User deactivated.' : 'User reactivated.');
      setToggling(null);
      refresh();
    } catch (err) {
      toast.error(err.message || 'Unable to update the user.');
    } finally {
      setToggleBusy(false);
    }
  };

  const openActivity = async (member) => {
    setActivityUser(member);
    setActivity(null);
    setActivityError('');
    try {
      const result = await api.get(`/users/${member.id}/activity`);
      setActivity(result);
    } catch (err) {
      setActivityError(err.message || 'Unable to load user activity.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Boss and staff accounts. Deactivated users keep their history but cannot sign in."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New user
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email…"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              <option value="boss">Boss</option>
              <option value="staff">Staff</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
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
          <LoadingBlock label="Loading users…" />
        ) : data?.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Total spend</th>
                    <th className="hidden lg:table-cell">Last login</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((member) => {
                    const isSelf = member.id === currentUser?.id;
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                              {member.name
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join('')}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
                                {member.name}
                                {isSelf ? <Badge tone="brand">You</Badge> : null}
                              </p>
                              <p className="truncate text-xs text-slate-500">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={member.role === 'boss' ? 'accent' : 'brand'}>
                            {member.role === 'boss' ? (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            ) : (
                              <UserRound className="h-3.5 w-3.5" />
                            )}
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={member.isActive ? 'success' : 'neutral'}>
                            {member.isActive ? 'Active' : 'Deactivated'}
                          </Badge>
                        </td>
                        <td className="text-right">{member.purchaseCount}</td>
                        <td className="whitespace-nowrap text-right font-medium text-slate-900">
                          {formatNaira(member.purchaseTotalKobo)}
                        </td>
                        <td className="hidden whitespace-nowrap text-sm lg:table-cell">
                          {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : 'Never'}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openActivity(member)}
                              aria-label={`View activity for ${member.name}`}
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(member)}
                              aria-label={`Edit ${member.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openReset(member)}
                              aria-label={`Reset password for ${member.name}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            {!isSelf ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  member.isActive
                                    ? 'text-rose-600 hover:bg-rose-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                )}
                                onClick={() => setToggling(member)}
                                aria-label={`${member.isActive ? 'Deactivate' : 'Reactivate'} ${member.name}`}
                              >
                                {member.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pagination={data.pagination} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            icon={UserRound}
            title="No matching users"
            description="Try a different search term or create a new account."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New user
              </Button>
            }
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New user"
        description="Staff can record purchases but cannot manage users or trash."
        footer={
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={creating}>
              Create user
            </Button>
          </>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          {createError ? <Alert tone="danger">{createError}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="user-name" required className="sm:col-span-2">
              <Input
                id="user-name"
                autoFocus
                required
                minLength={2}
                maxLength={80}
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Email address" htmlFor="user-email" required>
              <Input
                id="user-email"
                type="email"
                required
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Role" htmlFor="user-role" required>
              <Select
                id="user-role"
                value={createForm.role}
                onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="staff">Staff</option>
                <option value="boss">Boss</option>
              </Select>
            </Field>
            <Field
              label="Temporary password"
              htmlFor="user-password"
              required
              className="sm:col-span-2"
              hint="At least 10 characters, including a letter and a number."
            >
              <Input
                id="user-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit user"
        description="Changing email or role signs the user out of active sessions."
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
          <Field label="Full name" htmlFor="edit-user-name" required>
            <Input
              id="edit-user-name"
              required
              minLength={2}
              maxLength={80}
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Email address" htmlFor="edit-user-email" required>
            <Input
              id="edit-user-email"
              type="email"
              required
              value={editForm.email}
              onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
            />
          </Field>
          <Field label="Role" htmlFor="edit-user-role" required>
            <Select
              id="edit-user-role"
              value={editForm.role}
              onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}
            >
              <option value="staff">Staff</option>
              <option value="boss">Boss</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title={`Reset password for ${resetting?.name || 'user'}`}
        description="All of this user's active sessions will be signed out immediately."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(null)} disabled={resetSaving}>
              Cancel
            </Button>
            <Button onClick={submitReset} loading={resetSaving}>
              Reset password
            </Button>
          </>
        }
      >
        <form onSubmit={submitReset} className="space-y-4">
          {resetError ? <Alert tone="danger">{resetError}</Alert> : null}
          <Field
            label="New password"
            htmlFor="reset-user-password"
            required
            hint="At least 10 characters, including a letter and a number."
          >
            <Input
              id="reset-user-password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={toggleActive}
        loading={toggleBusy}
        title={toggling?.isActive ? 'Deactivate user?' : 'Reactivate user?'}
        description={
          toggling?.isActive
            ? `${toggling?.name} will be signed out and blocked from signing in. Their purchase history is kept.`
            : `${toggling?.name} will be able to sign in again with their existing password.`
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.isActive ? 'danger' : 'primary'}
      />

      <Modal
        open={Boolean(activityUser)}
        onClose={() => setActivityUser(null)}
        title={`Activity · ${activityUser?.name || ''}`}
        description={activityUser?.email}
        size="lg"
      >
        {activityError ? (
          <Alert tone="danger">{activityError}</Alert>
        ) : !activity ? (
          <LoadingBlock label="Loading activity…" />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="All-time purchases"
                value={activity.stats.totalPurchasesAllTime}
                icon={Activity}
                tone="brand"
              />
              <StatCard
                label="Total spend"
                value={formatNaira(activity.stats.totalKobo)}
                sub="All time"
                icon={ShieldCheck}
                tone="accent"
              />
              <StatCard
                label="Last purchase"
                value={activity.stats.lastPurchaseAt ? formatDate(activity.stats.lastPurchaseAt) : '—'}
                icon={UserRound}
                tone="violet"
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent purchases</h3>
              {activity.recentPurchases.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Transaction</th>
                        <th>Supplier</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.recentPurchases.map((purchase) => (
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
                          <td className="max-w-[12rem] truncate">{purchase.supplier.name}</td>
                          <td className="whitespace-nowrap text-right font-medium">
                            {formatNaira(purchase.totalKobo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  No purchases recorded yet.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent audit events</h3>
              {activity.auditTrail.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {activity.auditTrail.map((event) => (
                    <li key={event._id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{actionLabel(event.action)}</p>
                        {event.transactionNumber ? (
                          <p className="text-xs text-slate-500">{event.transactionNumber}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  No audit events yet.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
