import mongoose, { Document, Schema, Model } from 'mongoose';

export type PricingPlanId = 'pro' | 'advanced';

export interface IPricingConfig extends Document {
  planId: PricingPlanId;
  displayName: string;
  monthlyPriceINR: number;
  yearlyPriceINR: number;
  enabled: boolean;
  discountPercent: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const pricingConfigSchema = new Schema<IPricingConfig>(
  {
    planId: {
      type: String,
      enum: ['pro', 'advanced'],
      required: true,
      unique: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    monthlyPriceINR: { type: Number, required: true, min: 0 },
    yearlyPriceINR: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

const PricingConfig: Model<IPricingConfig> = mongoose.model<IPricingConfig>('PricingConfig', pricingConfigSchema);

export default PricingConfig;
