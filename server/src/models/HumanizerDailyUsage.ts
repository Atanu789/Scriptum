import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IHumanizerDailyUsage extends Document {
  userId: mongoose.Types.ObjectId;
  dayKey: string;
  requestsUsed: number;
  wordsProcessed: number;
  createdAt: Date;
  updatedAt: Date;
}

const humanizerDailyUsageSchema = new Schema<IHumanizerDailyUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dayKey: { type: String, required: true, index: true },
    requestsUsed: { type: Number, default: 0, min: 0 },
    wordsProcessed: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

humanizerDailyUsageSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

const HumanizerDailyUsage: Model<IHumanizerDailyUsage> = mongoose.model<IHumanizerDailyUsage>('HumanizerDailyUsage', humanizerDailyUsageSchema);
export default HumanizerDailyUsage;
