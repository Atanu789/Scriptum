import mongoose, { Document, Schema, Model } from 'mongoose';

export type HumanizerMode = 'standard' | 'creative' | 'advanced';

export interface IHumanizerHistory extends Document {
  userId: mongoose.Types.ObjectId;
  mode: HumanizerMode;
  originalText: string;
  humanizedText: string;
  wordCount: number;
  inputHash: string;
  quality: 'high' | 'medium' | 'low';
  aiLikelihoodScore: number;
  notes: string[];
  processingMs: number;
  cachedFromPrevious: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const humanizerHistorySchema = new Schema<IHumanizerHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['standard', 'creative', 'advanced'], default: 'standard', index: true },
    originalText: { type: String, required: true },
    humanizedText: { type: String, required: true },
    wordCount: { type: Number, required: true, min: 0 },
    inputHash: { type: String, required: true, index: true },
    quality: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    aiLikelihoodScore: { type: Number, min: 0, max: 100, default: 0 },
    notes: { type: [String], default: [] },
    processingMs: { type: Number, min: 0, default: 0 },
    cachedFromPrevious: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

humanizerHistorySchema.index({ userId: 1, inputHash: 1, mode: 1, createdAt: -1 });

const HumanizerHistory: Model<IHumanizerHistory> = mongoose.model<IHumanizerHistory>('HumanizerHistory', humanizerHistorySchema);
export default HumanizerHistory;
