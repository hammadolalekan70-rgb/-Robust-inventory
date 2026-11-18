const MAX_NAIRA = 1_000_000_000;
const MAX_QUANTITY = 1_000_000;
const KOBO_PER_NAIRA = 100n;
const MILLI = 1000n;

export class MoneyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoneyError';
    this.code = 'INVALID_MONEY';
  }
}

/**
 * Parse a Naira amount (string or number) into integer kobo.
 * Accepts "1,250.50", "₦1250.5", 1250.5. Rejects more than 2 decimals.
 */
export function parseNairaToKobo(input) {
  if (input === null || input === undefined || input === '') {
    throw new MoneyError('Amount is required');
  }
  let raw = typeof input === 'number' ? input.toString() : String(input);
  raw = raw.replace(/[₦,\s]/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(raw)) {
    throw new MoneyError('Amount must be a valid non-negative number with at most 2 decimals');
  }
  const [whole, frac = ''] = raw.split('.');
  const kobo = BigInt(whole) * KOBO_PER_NAIRA + BigInt((frac + '00').slice(0, 2));
  if (kobo > BigInt(MAX_NAIRA) * KOBO_PER_NAIRA) {
    throw new MoneyError(`Amount cannot exceed ${formatNaira(MAX_NAIRA * 100)}`);
  }
  return Number(kobo);
}

/**
 * Parse a quantity (string or number) into integer milli-units.
 * "2.5" -> 2500. At most 3 decimals.
 */
export function parseQuantityToMilli(input) {
  if (input === null || input === undefined || input === '') {
    throw new MoneyError('Quantity is required');
  }
  let raw = typeof input === 'number' ? input.toString() : String(input);
  raw = raw.replace(/,/g, '').trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(raw)) {
    throw new MoneyError('Quantity must be a valid non-negative number with at most 3 decimals');
  }
  const [whole, frac = ''] = raw.split('.');
  const milli = BigInt(whole) * MILLI + BigInt((frac + '000').slice(0, 3));
  if (milli > BigInt(MAX_QUANTITY) * MILLI) {
    throw new MoneyError(`Quantity cannot exceed ${MAX_QUANTITY}`);
  }
  return Number(milli);
}

/** line total in kobo = qtyMilli * unitPriceKobo / 1000, rounded half-up using BigInt */
export function lineTotalKobo(quantityMilli, unitPriceKobo) {
  const q = BigInt(Math.trunc(quantityMilli));
  const p = BigInt(Math.trunc(unitPriceKobo));
  return Number((q * p + MILLI / 2n) / MILLI);
}

export function sumKobo(values) {
  return values.reduce((acc, v) => acc + Number(v || 0), 0);
}

export function formatNaira(kobo) {
  const amount = Number(kobo || 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatNairaPlain(kobo) {
  const amount = Number(kobo || 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function koboToNairaString(kobo) {
  return (Number(kobo || 0) / 100).toFixed(2);
}

export function milliToQuantityString(milli) {
  return (Number(milli || 0) / 1000)
    .toFixed(3)
    .replace(/\.?0+$/, '') || '0';
}

export const MONEY_LIMITS = Object.freeze({ MAX_NAIRA, MAX_QUANTITY });
