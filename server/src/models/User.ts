import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export type Plan = 'free' | 'pro';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  clerkId?: string | null;
  email: string;
  password: string;
  name: string;
  resetPasswordToken: string | null;
  resetPasswordExpiresAt: Date | null;

  // ── Subscription ───────────────────────────────────────────────────────
  plan: Plan;
  planStartDate: Date | null;
  planExpiryDate: Date | null;
  razorpayCustomerId: string | null;
  razorpayPaymentId: string | null;

  // ── Usage metering ─────────────────────────────────────────────────────
  aiUsageThisMonth: number;
  uploadUsageThisMonth: number;
  aiUsageResetAt: Date | null;
  ttsUsageToday: number;
  ttsUsageDate: Date | null;
  aiUsageLimitOverride: number | null;
  uploadUsageLimitOverride: number | null;
  ttsUsageLimitOverride: number | null;

  // ── One-time free trials / overage grace ─────────────────────────────
  trialTtsNarrationUsed: boolean;
  trialExportUsed: boolean;
  trialAiOverageUsed: boolean;
  trialUploadOverageUsed: boolean;

  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: null,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    resetPasswordToken:   { type: String, default: null, select: false },
    resetPasswordExpiresAt:{ type: Date, default: null, select: false },

    // ── Subscription ─────────────────────────────────────────────────────
    plan:                { type: String, enum: ['free', 'pro'], default: 'free' },
    planStartDate:       { type: Date,   default: null },
    planExpiryDate:      { type: Date,   default: null },
    razorpayCustomerId:  { type: String, default: null },
    razorpayPaymentId:   { type: String, default: null },

    // ── Usage metering ───────────────────────────────────────────────────
    aiUsageThisMonth:     { type: Number, default: 0 },
    uploadUsageThisMonth: { type: Number, default: 0 },
    aiUsageResetAt:       { type: Date,   default: null },
    ttsUsageToday:        { type: Number, default: 0 },
    ttsUsageDate:         { type: Date,   default: null },
    aiUsageLimitOverride: { type: Number, default: null },
    uploadUsageLimitOverride: { type: Number, default: null },
    ttsUsageLimitOverride: { type: Number, default: null },

    // ── One-time free trials / overage grace ───────────────────────────
    trialTtsNarrationUsed:   { type: Boolean, default: false },
    trialExportUsed:         { type: Boolean, default: false },
    trialAiOverageUsed:      { type: Boolean, default: false },
    trialUploadOverageUsed:  { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (ret as any).password;
        return ret;
      },
    },
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
