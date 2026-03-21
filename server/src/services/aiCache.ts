import crypto from 'crypto';
import mongoose, { Model, Schema } from 'mongoose';

export interface AICacheRecord {
  hash: string;
  result: unknown;
  createdAt: Date;
  expiresAt: Date;
}

type AICacheDocument = AICacheRecord & mongoose.Document;

const aiCacheSchema = new Schema<AICacheDocument>(
  {
    hash: { type: String, required: true, unique: true, index: true },
    result: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  {
    versionKey: false,
    collection: 'ai_cache',
  }
);

const AICacheModel: Model<AICacheDocument> =
  mongoose.models.AICache || mongoose.model<AICacheDocument>('AICache', aiCacheSchema);

export function buildAICacheHash(input: {
  prompt: string;
  modelPreferences?: unknown;
  temperature?: number;
  maxTokens?: number;
}): string {
  const payload = [
    input.prompt || '',
    JSON.stringify(input.modelPreferences ?? null),
    String(input.temperature ?? ''),
    String(input.maxTokens ?? ''),
  ].join('::');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function getCachedAIResult<T = unknown>(hash: string): Promise<T | null> {
  const now = new Date();
  const row = await AICacheModel.findOne({ hash, expiresAt: { $gt: now } }).lean();
  if (!row) return null;
  return row.result as T;
}

export async function setCachedAIResult(hash: string, result: unknown, ttlHours = 24): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await AICacheModel.findOneAndUpdate(
    { hash },
    {
      hash,
      result,
      createdAt: now,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
