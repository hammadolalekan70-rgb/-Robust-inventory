const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const nairaWhole = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0
});

export function formatNaira(kobo) {
  return naira.format((Number(kobo) || 0) / 100);
}

export function formatNairaWhole(kobo) {
  return nairaWhole.format((Number(kobo) || 0) / 100);
}

export function formatNairaCompact(kobo) {
  const n = (Number(kobo) || 0) / 100;
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 10_000) return `₦${Math.round(n / 1_000)}k`;
  return formatNairaWhole(kobo);
}

export function koboToInput(kobo) {
  if (kobo === null || kobo === undefined || kobo === '') return '';
  return (Number(kobo) / 100).toFixed(2);
}

export function parseQuantityMilli(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const milli = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
  return milli > 0n ? milli : null;
}

export function parsePriceKobo(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const kobo = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return kobo > 0n ? kobo : null;
}

export function computeLineKobo(quantity, unitPrice) {
  const milli = parseQuantityMilli(quantity);
  const kobo = parsePriceKobo(unitPrice);
  if (milli === null || kobo === null) return null;
  return Number((milli * kobo + 500n) / 1000n);
}

export function computeTotalKobo(items) {
  return (items || []).reduce((sum, item) => sum + (computeLineKobo(item.quantity, item.unitPrice) || 0), 0);
}

export function formatQuantity(quantity, unitLabel) {
  const qty = String(quantity ?? '').trim();
  return unitLabel ? `${qty} ${unitLabel}` : qty;
}

export function todayISO() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfMonthISO(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonthISO(iso) {
  const [year, month] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

export function shiftMonthISO(iso, months) {
  const [year, month] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

export const DATE_PRESETS = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisYear', label: 'This year' }
];

export function rangeForPreset(key) {
  const today = todayISO();
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDaysISO(today, -6), to: today };
    case 'lastMonth': {
      const start = shiftMonthISO(today, -1);
      return { from: start, to: endOfMonthISO(start) };
    }
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'thisMonth':
    default:
      return { from: startOfMonthISO(today), to: today };
  }
}

export function formatDate(iso) {
  if (!iso) return '—';
  const text = String(iso);
  if (text.length > 10) {
    const moment = new Date(text);
    if (Number.isNaN(moment.getTime())) return text;
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Lagos'
    }).format(moment);
  }
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos'
  }).format(date);
}

export function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Failed sign-in',
  'auth.password_changed': 'Changed password',
  'auth.password_reset_requested': 'Requested password reset',
  'auth.password_reset_completed': 'Completed password reset',
  'user.create': 'Created user',
  'user.update': 'Updated user',
  'user.password_reset': 'Reset user password',
  'user.deactivate': 'Deactivated user',
  'user.reactivate': 'Reactivated user',
  'product.create': 'Created product',
  'product.update': 'Renamed product',
  'product.deactivate': 'Deactivated product',
  'product.reactivate': 'Reactivated product',
  'supplier.create': 'Created supplier',
  'supplier.update': 'Updated supplier',
  'supplier.deactivate': 'Deactivated supplier',
  'supplier.reactivate': 'Reactivated supplier',
  'purchase.create': 'Recorded purchase',
  'purchase.update': 'Corrected purchase',
  'purchase.delete': 'Moved purchase to trash',
  'purchase.restore': 'Restored purchase',
  'purchase.purge': 'Permanently deleted purchase',
  'purchase.attachment_add': 'Added attachment',
  'purchase.attachment_remove': 'Removed attachment'
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || 'Unknown action';
}

export function actionTone(action = '') {
  if (action.includes('purge') || action.includes('deactivate') || action.includes('failed')) return 'danger';
  if (action.includes('delete')) return 'warning';
  if (action.includes('create') || action.includes('restore') || action.includes('reactivate')) return 'success';
  return 'neutral';
}

export const ROLE_LABELS = { boss: 'Boss', staff: 'Staff' };

export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export const MAX_UPLOAD_MB = 5;
export const MAX_FILES = 5;
