import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import DocumentModel from '../models/Document';
import UsageModel from '../models/Usage';
import Payment from '../models/Payment';
import AdminAuditLog from '../models/AdminAuditLog';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

interface AdminLoginBody {
  username: string;
  password: string;
}

interface AdminUserPatchBody {
  plan?: 'free' | 'pro';
  planDays?: number;
  aiUsageLimitOverride?: number | null;
  uploadUsageLimitOverride?: number | null;
  resetUsage?: boolean;
  reason: string;
}

interface AdminDeleteBody {
  reason: string;
}

export const adminLoginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const listUsersValidation = [
  query('q').optional().trim().isLength({ max: 120 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const patchUserValidation = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('plan').optional().isIn(['free', 'pro']).withMessage('Plan must be free or pro'),
  body('planDays').optional().isInt({ min: 1, max: 3650 }).withMessage('planDays must be between 1 and 3650').toInt(),
  body('aiUsageLimitOverride').optional({ nullable: true }).isInt({ min: -1, max: 100000 }).withMessage('aiUsageLimitOverride must be -1 to 100000').toInt(),
  body('uploadUsageLimitOverride').optional({ nullable: true }).isInt({ min: -1, max: 100000 }).withMessage('uploadUsageLimitOverride must be -1 to 100000').toInt(),
  body('resetUsage').optional().isBoolean().withMessage('resetUsage must be boolean').toBoolean(),
  body('reason').trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

export const deleteUserValidation = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('reason').trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

function mapOverride(value?: number | null): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === -1) return -1;
  return value;
}

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { username, password } = req.body as AdminLoginBody;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(500).json({ success: false, error: 'Server misconfigured: ADMIN_USERNAME / ADMIN_PASSWORD missing' });
    return;
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ success: false, error: 'Server misconfigured: JWT_SECRET missing' });
    return;
  }

  const token = jwt.sign(
    {
      userId: 'admin',
      email: 'admin@local',
      role: 'admin',
      username,
    },
    secret,
    { expiresIn: '12h' },
  );

  res.json({
    success: true,
    data: {
      token,
      username,
    },
    message: 'Admin login successful',
  });
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const q = (req.query.q as string | undefined)?.trim() || '';
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 25);

    const filter = q
      ? {
          $or: [
            { email: { $regex: q, $options: 'i' } },
            { name: { $regex: q, $options: 'i' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name email plan planStartDate planExpiryDate aiUsageThisMonth uploadUsageThisMonth aiUsageLimitOverride uploadUsageLimitOverride createdAt updatedAt')
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);

    const [docCounts, usageRows] = await Promise.all([
      DocumentModel.aggregate<{ _id: string; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      UsageModel.find({ userId: { $in: userIds } })
        .select('userId totalAnalyses totalGeminiCalls')
        .lean(),
    ]);

    const docMap = new Map(docCounts.map((d) => [String(d._id), d.count]));
    const usageMap = new Map(usageRows.map((u) => [String(u.userId), u]));

    res.json({
      success: true,
      data: users.map((user) => {
        const usage = usageMap.get(String(user._id));
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          planStartDate: user.planStartDate,
          planExpiryDate: user.planExpiryDate,
          aiUsageThisMonth: user.aiUsageThisMonth,
          uploadUsageThisMonth: user.uploadUsageThisMonth,
          aiUsageLimitOverride: user.aiUsageLimitOverride,
          uploadUsageLimitOverride: user.uploadUsageLimitOverride,
          documentCount: docMap.get(String(user._id)) || 0,
          totalAnalyses: usage?.totalAnalyses || 0,
          totalGeminiCalls: usage?.totalGeminiCalls || 0,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

export const getOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      proUsers,
      freeUsers,
      totalDocuments,
      totalPayments,
      totalCapturedAmount,
      totalAnalysesResult,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ plan: 'pro' }),
      User.countDocuments({ plan: 'free' }),
      DocumentModel.countDocuments(),
      Payment.countDocuments(),
      Payment.aggregate<{ total: number }>([
        { $match: { status: 'captured' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      UsageModel.aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$totalAnalyses' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        proUsers,
        freeUsers,
        totalDocuments,
        totalPayments,
        totalRevenueINR: (totalCapturedAmount[0]?.total || 0) / 100,
        totalAnalyses: totalAnalysesResult[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch admin overview' });
  }
};

export const patchUser = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const userId = req.params.id;
  const {
    plan,
    planDays,
    aiUsageLimitOverride,
    reason,
    uploadUsageLimitOverride,
    resetUsage,
  } = req.body as AdminUserPatchBody;

  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (plan) {
      user.plan = plan;

      if (plan === 'free') {
        user.planStartDate = null;
        user.planExpiryDate = null;
      } else {
        const now = new Date();
        const expiry = new Date(now);
        expiry.setDate(expiry.getDate() + (planDays || 30));
        user.planStartDate = now;
        user.planExpiryDate = expiry;
      }
    }

    const aiOverride = mapOverride(aiUsageLimitOverride);
    if (aiOverride !== undefined) {
      user.aiUsageLimitOverride = aiOverride;
    }

    const uploadOverride = mapOverride(uploadUsageLimitOverride);
    if (uploadOverride !== undefined) {
      user.uploadUsageLimitOverride = uploadOverride;
    }

    if (resetUsage) {
      user.aiUsageThisMonth = 0;
      user.uploadUsageThisMonth = 0;
      user.aiUsageResetAt = new Date();
      await UsageModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            geminiCallsThisHour: 0,
            lastResetAt: new Date(),
          },
        },
        { upsert: false },
      );
    }

    await user.save();

    // Log audit trail
    let action: 'grant_premium' | 'revoke_premium' | 'reset_usage' | 'set_ai_limit' | 'set_upload_limit' = 'reset_usage';
    if (plan === 'pro') action = 'grant_premium';
    else if (plan === 'free') action = 'revoke_premium';
    else if (aiOverride !== undefined) action = 'set_ai_limit';
    else if (uploadOverride !== undefined) action = 'set_upload_limit';

    const adminUsername = (req as any).decodedToken?.username || 'unknown';
    const changes = {
      plan: plan ?? null,
      planDays: planDays ?? null,
      aiUsageLimitOverride: aiOverride ?? null,
      uploadUsageLimitOverride: uploadOverride ?? null,
      resetUsage: Boolean(resetUsage),
    };

    try {
      await AdminAuditLog.create({
        adminUsername,
        action,
        targetUserId: user._id,
        targetUserEmail: user.email,
        reason,
        changes,
      });
    } catch (auditErr) {
      console.error('Failed to log admin action:', auditErr);
      // Don't fail the user update if audit log fails
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        planStartDate: user.planStartDate,
        planExpiryDate: user.planExpiryDate,
        aiUsageThisMonth: user.aiUsageThisMonth,
        uploadUsageThisMonth: user.uploadUsageThisMonth,
        aiUsageLimitOverride: user.aiUsageLimitOverride,
        uploadUsageLimitOverride: user.uploadUsageLimitOverride,
      },
      message: 'User updated successfully',
    });
  } catch (err) {
    console.error('Admin patch user error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
};

export const deleteUserByAdmin = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const userId = req.params.id;
  const { reason } = req.body as AdminDeleteBody;

  try {
    // Fetch user before deletion to get email
    const userBeforeDelete = await User.findById(userId);
    if (!userBeforeDelete) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const [docResult, paymentResult, usageResult] = await Promise.all([
      DocumentModel.deleteMany({ userId }),
      Payment.deleteMany({ userId }),
      UsageModel.deleteMany({ userId }),
      User.findByIdAndDelete(userId),
    ]);

    // Log audit trail
    const adminUsername = (req as any).decodedToken?.username || 'unknown';
    try {
      await AdminAuditLog.create({
        adminUsername,
        action: 'delete_user',
        targetUserId: userBeforeDelete._id,
        targetUserEmail: userBeforeDelete.email,
        reason,
        changes: {
          documentsDeleted: docResult.deletedCount,
          paymentsDeleted: paymentResult.deletedCount,
          usagesDeleted: usageResult.deletedCount,
        },
      });
    } catch (auditErr) {
      console.error('Failed to log admin delete action:', auditErr);
      // Don't fail the deletion if audit log fails
    }

    res.json({
      success: true,
      data: {
        userId,
        documentsDeleted: docResult.deletedCount,
        paymentsDeleted: paymentResult.deletedCount,
        usagesDeleted: usageResult.deletedCount,
      },
      message: 'User account deleted by admin',
    });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
};

export const getAuditLogs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const logs = await AdminAuditLog.find()
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    console.error('Admin audit logs error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
};

