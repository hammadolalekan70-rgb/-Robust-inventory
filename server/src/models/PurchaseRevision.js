import mongoose from 'mongoose';

const { Schema } = mongoose;

const changeSchema = new Schema(
  {
    field: { type: String, required: true },
    label: { type: String, default: '' },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

const purchaseRevisionSchema = new Schema(
  {
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true, index: true },
    revisionNumber: { type: Number, required: true },
    changes: { type: [changeSchema], default: [] },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    reason: { type: String, default: '', maxlength: 300 }
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

purchaseRevisionSchema.index({ purchase: 1, revisionNumber: -1 });

export const PurchaseRevision = mongoose.model('PurchaseRevision', purchaseRevisionSchema);
