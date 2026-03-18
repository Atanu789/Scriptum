import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IAdminAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  adminUsername: string;
  action: 'grant_premium' | 'revoke_premium' | 'reset_usage' | 'set_ai_limit' | 'set_upload_limit' | 'delete_user';
  targetUserId: mongoose.Types.ObjectId;
  targetUserEmail: string;
  reason: string;
  changes: Record<string, any>;
  timestamp: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminUsername: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['grant_premium', 'revoke_premium', 'reset_usage', 'set_ai_limit', 'set_upload_limit', 'delete_user'],
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    targetUserEmail: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    changes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
  },
  { timestamps: false }
);

// TTL index: auto-delete logs after 90 days
adminAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

const AdminAuditLog: Model<IAdminAuditLog> = mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);

export default AdminAuditLog;
