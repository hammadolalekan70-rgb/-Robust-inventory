import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { escapeRegex, nameSimilarity, normalizeName } from '../lib/normalize.js';

const SIMILARITY_THRESHOLD = 0.55;
const MAX_CANDIDATES = 250;

function candidateRegex(normalized) {
  const tokens = normalized.split(' ').filter((t) => t.length >= 3).slice(0, 4);
  if (!tokens.length) return new RegExp(escapeRegex(normalized), 'i');
  return new RegExp(tokens.map(escapeRegex).join('|'), 'i');
}

async function findSimilar(Model, name, { excludeId, limit = 8 } = {}) {
  const normalized = normalizeName(name);
  if (!normalized) return [];

  const query = { $or: [{ normalizedName: candidateRegex(normalized) }, { name: candidateRegex(normalized) }] };
  if (excludeId) query._id = { $ne: excludeId };

  const candidates = await Model.find(query).limit(MAX_CANDIDATES).lean();
  return candidates
    .map((c) => ({
      id: c._id.toString(),
      name: c.name,
      isActive: c.isActive,
      phone: c.phone,
      address: c.address,
      score: Number(nameSimilarity(normalized, c.normalizedName || c.name).toFixed(3))
    }))
    .filter((c) => c.id && c.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function findSimilarProducts(name, options) {
  return findSimilar(Product, name, options);
}

export function findSimilarSuppliers(name, options) {
  return findSimilar(Supplier, name, options);
}
