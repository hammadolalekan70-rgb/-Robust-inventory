/** Normalize a product/supplier name for duplicate detection and search. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(value) {
  const out = [];
  for (let i = 0; i < value.length - 1; i += 1) out.push(value.slice(i, i + 2));
  return out;
}

export function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map();
  for (const g of bigrams(a)) counts.set(g, (counts.get(g) || 0) + 1);
  let intersection = 0;
  for (const g of bigrams(b)) {
    const c = counts.get(g) || 0;
    if (c > 0) {
      intersection += 1;
      counts.set(g, c - 1);
    }
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

/** 0..1 similarity, with containment treated as strongly similar. */
export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.startsWith(nb + ' ') || nb.startsWith(na + ' ') || na.endsWith(' ' + nb) || nb.endsWith(' ' + na)) {
    return 0.92;
  }
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  return diceCoefficient(na, nb);
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
