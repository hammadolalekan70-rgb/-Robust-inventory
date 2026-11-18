import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditEventSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: 'System', maxlength: 80 },
    actorRole: { type: String, enum: ['boss', 'staff', 'system'], default: 'system' },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    transactionNumber: { type: String, default: '' },
    field: { type: String, default: '' },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '', maxlength: 300 }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

auditEventSchema.index({ createdAt: -1 });

export const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
