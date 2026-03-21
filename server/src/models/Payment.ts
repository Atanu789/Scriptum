import mongoose, { Document, Schema, Model } from 'mongoose';
import { Plan } from './User';

export type BillingCycle = 'monthly' | 'yearly';

export interface IPayment extends Document {
  userId:             mongoose.Types.ObjectId;
  plan:               Plan;
  pricingTier:        'pro' | 'advanced';
  billingCycle:       BillingCycle;
  amount:             number;   // in paise
  currency:           string;
  razorpayOrderId:    string;
  razorpayPaymentId:  string | null;
  status:             'created' | 'captured' | 'failed' | 'refunded';
  createdAt:          Date;
  updatedAt:          Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan:              { type: String, enum: ['free', 'pro'], required: true },
    pricingTier:       { type: String, enum: ['pro', 'advanced'], default: 'pro', index: true },
    billingCycle:      { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    amount:            { type: Number, required: true },
    currency:          { type: String, default: 'INR' },
    razorpayOrderId:   { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, default: null },
    status:            { type: String, enum: ['created', 'captured', 'failed', 'refunded'], default: 'created' },
  },
  { timestamps: true },
);

const Payment: Model<IPayment> = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
