import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdminCredential extends Document {
  username: string;
  passwordHash: string;
  updatedByEmail?: string | null;
}

const adminCredentialSchema = new Schema<IAdminCredential>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: true,
    },
    updatedByEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

adminCredentialSchema.index({ username: 1 }, { unique: true });

const AdminCredential: Model<IAdminCredential> = mongoose.model<IAdminCredential>('AdminCredential', adminCredentialSchema);

export default AdminCredential;
