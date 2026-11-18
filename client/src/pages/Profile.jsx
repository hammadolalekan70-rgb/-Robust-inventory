import { useState } from 'react';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDateTime, ROLE_LABELS } from '../lib/format.js';
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
  PageHeader
} from '../components/ui.jsx';

export default function Profile() {
  const { user, isBoss } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated. Other sessions were signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Unable to change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" description="Your account details and password settings." />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Change password"
              description="Use at least 10 characters, including a letter and a number."
            />
            <form onSubmit={onSubmit} className="space-y-4 p-5">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New password" htmlFor="profile-new-password" required>
                  <Input
                    id="profile-new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="profile-confirm-password" required>
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saving}>
                  <KeyRound className="h-4 w-4" />
                  Update password
                </Button>
              </div>
            </form>
          </Card>

          <Alert tone="info" title="Session security">
            Changing your password signs out every other device. This device stays signed in. Sessions
            also expire automatically after inactivity.
          </Alert>
        </div>

        <Card className="h-fit">
          <CardHeader title="Account" />
          <div className="space-y-4 p-5 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
                {user?.name
                  ?.split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join('')}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{user?.name}</p>
                <Badge tone={isBoss ? 'accent' : 'brand'}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {ROLE_LABELS[user?.role] || user?.role}
                </Badge>
              </div>
            </div>
            <div className="flex items-start gap-2 border-t border-slate-100 pt-3">
              <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                <p className="break-all text-slate-800">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last login</p>
                <p className="text-slate-800">
                  {user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'This is your first session'}
                </p>
              </div>
            </div>
            {isBoss ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                As a boss you can manage users, view the audit log and restore purchases from trash.
              </p>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                Staff accounts can record purchases and edit the ones they recorded. Management pages are
                reserved for the boss.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
