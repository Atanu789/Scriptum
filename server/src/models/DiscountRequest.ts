import mongoose, { Document, Schema, Model } from 'mongoose';

export type DiscountRequestStatus = 'pending' | 'approved' | 'rejected';
export type RequestedPricingPlan = 'pro' | 'advanced';

export interface IDiscountRequest extends Document {
  email: string;
  reason: string;
  requestedPlan: RequestedPricingPlan;
  status: DiscountRequestStatus;
  offeredDiscountPercent: number | null;
  assignedPlan: 'free' | 'pro' | 'advanced' | null;
  adminNotes: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const discountRequestSchema = new Schema<IDiscountRequest>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    requestedPlan: { type: String, enum: ['pro', 'advanced'], default: 'pro' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    offeredDiscountPercent: { type: Number, default: null, min: 0, max: 100 },
    assignedPlan: { type: String, enum: ['free', 'pro', 'advanced'], default: null },
    adminNotes: { type: String, default: null, trim: true, maxlength: 2000 },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const DiscountRequest: Model<IDiscountRequest> = mongoose.model<IDiscountRequest>('DiscountRequest', discountRequestSchema);

export default DiscountRequest;
