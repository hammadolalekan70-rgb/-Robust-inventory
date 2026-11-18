import mongoose from 'mongoose';
import { normalizeName } from '../lib/normalize.js';

const { Schema } = mongoose;

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedName: { type: String, required: true, index: true },
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

productSchema.index({ isActive: 1, normalizedName: 1 });

productSchema.pre('validate', function setNormalized(next) {
  if (this.isModified('name') || !this.normalizedName) {
    this.normalizedName = normalizeName(this.name);
  }
  next();
});

export const Product = mongoose.model('Product', productSchema);
