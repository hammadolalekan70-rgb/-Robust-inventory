import mongoose from 'mongoose';
import { normalizeName } from '../lib/normalize.js';

const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedName: { type: String, required: true, index: true },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    isActive: { type: Boolean, default: true, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
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

supplierSchema.index({ isActive: 1, normalizedName: 1 });

supplierSchema.pre('validate', function setNormalized(next) {
  if (this.isModified('name') || !this.normalizedName) {
    this.normalizedName = normalizeName(this.name);
  }
  next();
});

export const Supplier = mongoose.model('Supplier', supplierSchema);
