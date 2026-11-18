import mongoose from 'mongoose';

const { Schema } = mongoose;

const purchaseItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productNameSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    unitLabel: { type: String, trim: true, maxlength: 20, default: '' },
    quantityMilli: { type: Number, required: true, min: 1 },
    unitPriceKobo: { type: Number, required: true, min: 0 },
    lineTotalKobo: { type: Number, required: true, min: 0 }
  },
  { _id: true }
);

const supplierSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' }
  },
  { _id: false }
);

const purchaseSchema = new Schema(
  {
    transactionNumber: { type: String, required: true, unique: true, index: true },
    purchaseDate: { type: Date, required: true, index: true },
    purchaseDay: { type: String, required: true, index: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedByName: { type: String, required: true, trim: true, maxlength: 80 },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierSnapshot: { type: supplierSnapshotSchema, required: true },
    items: {
      type: [purchaseItemSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'A purchase must contain at least one item'
      }
    },
    totalKobo: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    attachments: [{ type: Schema.Types.ObjectId, ref: 'Attachment' }],
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revisionCount: { type: Number, default: 0 }
  },
  {
    timestamps: true,
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

purchaseSchema.index({ deletedAt: 1, purchaseDate: -1 });
purchaseSchema.index({ recordedBy: 1, purchaseDate: -1 });
purchaseSchema.index({ supplier: 1, purchaseDate: -1 });
purchaseSchema.index({ 'items.product': 1, purchaseDate: -1 });
purchaseSchema.index({ purchaseDay: -1 });
purchaseSchema.index({ 'items.productNameSnapshot': 1 });

export const Purchase = mongoose.model('Purchase', purchaseSchema);
