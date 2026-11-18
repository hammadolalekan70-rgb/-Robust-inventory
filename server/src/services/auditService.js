import { AuditEvent } from '../models/AuditEvent.js';
import { logger } from '../lib/logger.js';

/**
 * Persist an audit event. Values stored in `oldValue`/`newValue` must already be
 * JSON-safe (strings, numbers, booleans, small objects).
 */
export async function recordAudit({
  req,
  actor = null,
  action,
  entityType,
  entityId = null,
  transactionNumber = '',
  field = '',
  oldValue = null,
  newValue = null
}) {
  try {
    await AuditEvent.create({
      actor: actor?._id || null,
      actorName: actor?.name || (actor ? 'Unknown' : 'System'),
      actorRole: actor?.role || 'system',
      action,
      entityType,
      entityId: entityId || null,
      transactionNumber,
      field,
      oldValue: oldValue === undefined ? null : oldValue,
      newValue: newValue === undefined ? null : newValue,
      ip: req?.ip || '',
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 300)
    });
  } catch (err) {
    logger.error('Failed to write audit event', action, err.message);
    throw err;
  }
}
