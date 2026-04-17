import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClerkClient, verifyToken } from '@clerk/backend';
import User from '../models/User';
import DocumentModel from '../models/Document';
import UsageModel from '../models/Usage';
import Payment from '../models/Payment';
import AdminAuditLog from '../models/AdminAuditLog';
import AdminCredential from '../models/AdminCredential';
import PricingConfig from '../models/PricingConfig';
import DiscountRequest from '../models/DiscountRequest';
import { AuthenticatedRequest } from '../types';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MANAGEMENT_EMAIL_ALLOWLIST = new Set(['gdnvision360@gmail.com', 'atanugm8@gmail.com']);
let clerkClientCache: ReturnType<typeof createClerkClient> | null = null;

function deriveYearlyPrice(monthlyPriceINR: number): number {
  return Math.max(0, Math.round(monthlyPriceINR * 12));
}

interface AdminLoginBody {
  username: string;
  password: string;
}

interface AdminChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface ManagementAccessVerificationResult {
  email: string | null;
  isAllowed: boolean;
}

interface AdminUserPatchBody {
  plan?: 'free' | 'pro';
  planDays?: number;
  aiUsageLimitOverride?: number | null;
  uploadUsageLimitOverride?: number | null;
  ttsUsageLimitOverride?: number | null;
  trialTtsNarrationUsed?: boolean;
  resetUsage?: boolean;
  reason?: string;
}

interface AdminDeleteBody {
  reason?: string;
}

export const adminLoginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const changeAdminPasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must include at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must include at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must include at least one number'),
];

export const listUsersValidation = [
  query('q').optional().trim().isLength({ max: 120 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const getAuditLogsValidation = [
  query('q').optional().trim().isLength({ max: 120 }),
  query('action').optional().trim().isLength({ min: 1, max: 60 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const patchUserValidation = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('plan').optional().isIn(['free', 'pro']).withMessage('Plan must be free or pro'),
  body('planDays').optional().isInt({ min: 1, max: 3650 }).withMessage('planDays must be between 1 and 3650').toInt(),
  body('aiUsageLimitOverride').optional({ nullable: true }).isInt({ min: -1, max: 100000 }).withMessage('aiUsageLimitOverride must be -1 to 100000').toInt(),
  body('uploadUsageLimitOverride').optional({ nullable: true }).isInt({ min: -1, max: 100000 }).withMessage('uploadUsageLimitOverride must be -1 to 100000').toInt(),
  body('ttsUsageLimitOverride').optional({ nullable: true }).isInt({ min: -1, max: 100000 }).withMessage('ttsUsageLimitOverride must be -1 to 100000').toInt(),
  body('trialTtsNarrationUsed').optional().isBoolean().withMessage('trialTtsNarrationUsed must be boolean').toBoolean(),
  body('resetUsage').optional().isBoolean().withMessage('resetUsage must be boolean').toBoolean(),
  body('reason').optional().trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

export const updatePricingValidation = [
  param('planId').isIn(['pro', 'advanced']).withMessage('Invalid pricing plan'),
  body('monthlyPriceINR').optional().isFloat({ min: 0 }).withMessage('monthlyPriceINR must be >= 0').toFloat(),
  body('yearlyPriceINR').optional().isFloat({ min: 0 }).withMessage('yearlyPriceINR must be >= 0').toFloat(),
  body('enabled').optional().isBoolean().withMessage('enabled must be boolean').toBoolean(),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('discountPercent must be between 0 and 100').toFloat(),
  body('displayName').optional().trim().isLength({ min: 2, max: 60 }).withMessage('displayName must be 2-60 characters'),
  body('reason').optional().trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

export const updateDiscountRequestValidation = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
  body('offeredDiscountPercent').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('offeredDiscountPercent must be 0-100').toFloat(),
  body('assignedPlan').optional({ nullable: true }).isIn(['free', 'pro', 'advanced']).withMessage('assignedPlan must be free/pro/advanced'),
  body('assignToUser').optional().isBoolean().withMessage('assignToUser must be boolean').toBoolean(),
  body('planDays').optional().isInt({ min: 1, max: 3650 }).withMessage('planDays must be between 1 and 3650').toInt(),
  body('adminNotes').optional({ nullable: true }).trim().isLength({ max: 2000 }).withMessage('adminNotes max length is 2000'),
  body('reason').optional().trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

export const deleteUserValidation = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('reason').optional().trim().isLength({ min: 5, max: 240 }).withMessage('reason must be 5-240 characters'),
];

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

async function buildAdminMetrics() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [
    totalUsers,
    proUsers,
    freeUsers,
    activeSubscriptions,
    activeUsersLast7Days,
    totalDocuments,
    totalRevenueAgg,
    monthlyRevenueAgg,
    current30dRevenueAgg,
    previous30dRevenueAgg,
    current30dUsers,
    previous30dUsers,
    totalAnalysesResult,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ plan: 'pro' }),
    User.countDocuments({ plan: 'free' }),
    User.countDocuments({ plan: 'pro', planExpiryDate: { $gt: now } }),
    User.countDocuments({ updatedAt: { $gte: sevenDaysAgo } }),
    DocumentModel.countDocuments(),
    Payment.aggregate<{ total: number }>([
      { $match: { status: 'captured' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      { $match: { status: 'captured', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      { $match: { status: 'captured', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      {
        $match: {
          status: 'captured',
          createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    UsageModel.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$totalAnalyses' } } },
    ]),
  ]);

  const totalRevenueINR = (totalRevenueAgg[0]?.total || 0) / 100;
  const monthlyRevenueINR = (monthlyRevenueAgg[0]?.total || 0) / 100;
  const current30dRevenue = (current30dRevenueAgg[0]?.total || 0) / 100;
  const previous30dRevenue = (previous30dRevenueAgg[0]?.total || 0) / 100;

  return {
    totalUsers,
    activeUsersLast7Days,
    proUsers,
    activeSubscriptions,
    freeUsers,
    totalDocuments,
    totalRevenueINR,
    monthlyRevenueINR,
    totalAnalyses: totalAnalysesResult[0]?.total || 0,
    revenuePerUserINR: totalUsers ? Number((totalRevenueINR / totalUsers).toFixed(2)) : 0,
    trends: {
      userGrowth30dPct: pctDelta(current30dUsers, previous30dUsers),
      revenueGrowth30dPct: pctDelta(current30dRevenue, previous30dRevenue),
      proSharePct: totalUsers ? Number(((proUsers / totalUsers) * 100).toFixed(1)) : 0,
      activeSharePct: totalUsers ? Number(((activeUsersLast7Days / totalUsers) * 100).toFixed(1)) : 0,
    },
  };
}

function mapOverride(value?: number | null): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === -1) return -1;
  return value;
}

function isManagementEmail(email?: string | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  return MANAGEMENT_EMAIL_ALLOWLIST.has(normalized);
}

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  if (!clerkClientCache) {
    clerkClientCache = createClerkClient({ secretKey });
  }

  return clerkClientCache;
}

async function resolveClerkEmailFromAuthorizationHeader(authHeader?: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  const clerkClient = getClerkClient();
  if (!secretKey || !clerkClient) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const verified = await verifyToken(token, { secretKey });
  const clerkUserId = (verified as { sub?: string }).sub?.trim();
  if (!clerkUserId) {
    return null;
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryId = clerkUser.primaryEmailAddressId;
  const primary = (clerkUser.emailAddresses || []).find((entry) => entry.id === primaryId) || clerkUser.emailAddresses?.[0];
  const email = primary?.emailAddress?.trim().toLowerCase() || null;
  return email;
}

async function verifyAdminPassword(adminPasswordInput: string): Promise<{ valid: boolean; credentialBacked: boolean }> {
  const normalizedUsername = (ADMIN_USERNAME || '').trim().toLowerCase();
  const existingCredential = normalizedUsername
    ? await AdminCredential.findOne({ username: normalizedUsername }).select('+passwordHash')
    : null;

  if (existingCredential?.passwordHash) {
    const valid = await bcrypt.compare(adminPasswordInput, existingCredential.passwordHash);
    return { valid, credentialBacked: true };
  }

  if (!ADMIN_PASSWORD) {
    return { valid: false, credentialBacked: false };
  }

  return { valid: adminPasswordInput === ADMIN_PASSWORD, credentialBacked: false };
}

async function ensureCredentialBackedPassword(password: string, updatedByEmail?: string): Promise<void> {
  if (!ADMIN_USERNAME) return;
  const normalizedUsername = ADMIN_USERNAME.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  await AdminCredential.findOneAndUpdate(
    { username: normalizedUsername },
    {
      $set: {
        username: normalizedUsername,
        passwordHash,
        updatedByEmail: updatedByEmail?.trim().toLowerCase() || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { username, password } = req.body as AdminLoginBody;

  if (!ADMIN_USERNAME) {
    res.status(500).json({ success: false, error: 'Server misconfigured: ADMIN_USERNAME missing' });
    return;
  }

  if (username !== ADMIN_USERNAME) {
    res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    return;
  }

  const { valid, credentialBacked } = await verifyAdminPassword(password);
  if (!valid) {
    res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    return;
  }

  if (!credentialBacked) {
    await ensureCredentialBackedPassword(password);
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

export const changeAdminPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  if (!ADMIN_USERNAME) {
    res.status(500).json({ success: false, error: 'Server misconfigured: ADMIN_USERNAME missing' });
    return;
  }

  let requesterEmail: string | null = null;
  try {
    requesterEmail = await resolveClerkEmailFromAuthorizationHeader(req.headers.authorization);
  } catch {
    requesterEmail = null;
  }

  if (!isManagementEmail(requesterEmail)) {
    res.status(403).json({ success: false, error: 'Only management accounts can change admin password' });
    return;
  }

  const { currentPassword, newPassword } = req.body as AdminChangePasswordBody;
  const verification = await verifyAdminPassword(currentPassword);
  if (!verification.valid) {
    res.status(401).json({ success: false, error: 'Current password is incorrect' });
    return;
  }

  await ensureCredentialBackedPassword(newPassword, requesterEmail ?? undefined);

  try {
    await AdminAuditLog.create({
      adminUsername: requesterEmail,
      action: 'change_admin_password',
      targetUserId: 'admin',
      targetUserEmail: `admin:${ADMIN_USERNAME}`,
      reason: 'Admin dashboard password changed by management account',
    });
  } catch (auditErr) {
    console.error('Failed to log admin password change:', auditErr);
  }

  res.json({
    success: true,
    message: 'Admin password updated successfully',
  });
};

export const verifyManagementAccess = async (req: Request, res: Response): Promise<void> => {
  let requesterEmail: string | null = null;
  try {
    requesterEmail = await resolveClerkEmailFromAuthorizationHeader(req.headers.authorization);
  } catch {
    requesterEmail = null;
  }

  const data: ManagementAccessVerificationResult = {
    email: requesterEmail,
    isAllowed: isManagementEmail(requesterEmail),
  };

  if (!requesterEmail) {
    res.status(401).json({
      success: false,
      error: 'Unable to verify Clerk session email',
      data,
    });
    return;
  }

  res.json({
    success: true,
    data,
    message: data.isAllowed ? 'Management access verified' : 'Management access denied',
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
        .select('name email plan planStartDate planExpiryDate aiUsageThisMonth uploadUsageThisMonth aiUsageLimitOverride uploadUsageLimitOverride trialTtsNarrationUsed createdAt updatedAt')
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);

    const [docCounts, usageRows] = await Promise.all([
      DocumentModel.aggregate<{ _id: string; count: number; lastDocActivityAt: Date | null }>([
        { $match: { userId: { $in: userIds } } },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            lastDocActivityAt: { $max: '$updatedAt' },
          },
        },
      ]),
      UsageModel.find({ userId: { $in: userIds } })
        .select('userId totalAnalyses totalGeminiCalls updatedAt')
        .lean(),
    ]);

    const docMap = new Map(docCounts.map((d) => [String(d._id), d]));
    const usageMap = new Map(usageRows.map((u) => [String(u.userId), u]));
    const activeThreshold = new Date();
    activeThreshold.setDate(activeThreshold.getDate() - 7);

    res.json({
      success: true,
      data: users.map((user) => {
        const usage = usageMap.get(String(user._id));
        const docStats = docMap.get(String(user._id));
        const lastActivityCandidates = [
          user.updatedAt ? new Date(user.updatedAt).getTime() : 0,
          usage?.updatedAt ? new Date(usage.updatedAt).getTime() : 0,
          docStats?.lastDocActivityAt ? new Date(docStats.lastDocActivityAt).getTime() : 0,
        ].filter((v) => Number.isFinite(v) && v > 0);

        const lastActiveAt = lastActivityCandidates.length
          ? new Date(Math.max(...lastActivityCandidates))
          : null;

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
          trialTtsNarrationUsed: Boolean(user.trialTtsNarrationUsed),
          documentCount: docStats?.count || 0,
          totalAnalyses: usage?.totalAnalyses || 0,
          totalGeminiCalls: usage?.totalGeminiCalls || 0,
          lastActiveAt,
          status: lastActiveAt && lastActiveAt >= activeThreshold ? 'active' : 'inactive',
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
    const metrics = await buildAdminMetrics();
    const totalPayments = await Payment.countDocuments({ status: 'captured' });

    res.json({
      success: true,
      data: {
        ...metrics,
        totalUsers: metrics.totalUsers,
        proUsers: metrics.proUsers,
        freeUsers: metrics.freeUsers,
        totalDocuments: metrics.totalDocuments,
        totalPayments,
        totalRevenueINR: metrics.totalRevenueINR,
        totalAnalyses: metrics.totalAnalyses,
      },
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch admin overview' });
  }
};

export const getMetrics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await buildAdminMetrics();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch admin metrics' });
  }
};

export const getRevenue = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [capturedAgg, monthAgg, planAgg, usersCount, activeSubscriptions, monthlySeries] = await Promise.all([
      Payment.aggregate<{ total: number }>([
        { $match: { status: 'captured' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate<{ total: number }>([
        { $match: { status: 'captured', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      User.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      User.countDocuments(),
      User.countDocuments({ plan: 'pro', planExpiryDate: { $gt: now } }),
      Payment.aggregate<{ _id: { year: number; month: number }; totalAmount: number; payments: number }>([
        {
          $match: {
            status: 'captured',
            createdAt: { $gte: start },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            totalAmount: { $sum: '$amount' },
            payments: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRevenueINR = (capturedAgg[0]?.total || 0) / 100;
    const monthlyRevenueINR = (monthAgg[0]?.total || 0) / 100;
    const planDistribution = {
      free: planAgg.find((p) => p._id === 'free')?.count || 0,
      pro: planAgg.find((p) => p._id === 'pro')?.count || 0,
    };

    const seriesMap = new Map(
      monthlySeries.map((item) => [
        `${item._id.year}-${item._id.month}`,
        {
          revenueINR: Number((item.totalAmount / 100).toFixed(2)),
          payments: item.payments,
        },
      ])
    );

    const monthlyRevenue = Array.from({ length: 12 }).map((_, idx) => {
      const dt = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
      const key = `${dt.getFullYear()}-${dt.getMonth() + 1}`;
      const matched = seriesMap.get(key);
      return {
        key,
        label: dt.toLocaleString('en-US', { month: 'short' }),
        revenueINR: matched?.revenueINR || 0,
        payments: matched?.payments || 0,
      };
    });

    res.json({
      success: true,
      data: {
        totalRevenueINR: Number(totalRevenueINR.toFixed(2)),
        monthlyRevenueINR: Number(monthlyRevenueINR.toFixed(2)),
        activeSubscriptions,
        revenuePerUserINR: usersCount ? Number((totalRevenueINR / usersCount).toFixed(2)) : 0,
        subscriptionDistribution: planDistribution,
        monthlyRevenue,
      },
    });
  } catch (err) {
    console.error('Admin revenue error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch admin revenue' });
  }
};

export const getPricingConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await PricingConfig.find({ planId: { $in: ['pro', 'advanced'] } }).sort({ planId: 1 }).lean();
    const rowMap = new Map(rows.map((row) => [row.planId, row]));

    const fallback = {
      pro: {
        planId: 'pro',
        displayName: 'Pro',
        monthlyPriceINR: 2500,
        yearlyPriceINR: 24000,
        enabled: true,
        discountPercent: 0,
      },
      advanced: {
        planId: 'advanced',
        displayName: 'Advanced',
        monthlyPriceINR: 3500,
        yearlyPriceINR: 42000,
        enabled: true,
        discountPercent: 0,
      },
    } as const;

    const planIds = ['pro', 'advanced'] as const;
    const data = planIds.map((planId) => {
      const row = rowMap.get(planId);
      const fb = fallback[planId];
      const monthlyPriceINR = Number.isFinite(row?.monthlyPriceINR) ? row!.monthlyPriceINR : fb.monthlyPriceINR;
      const yearlyPriceINR = Number.isFinite(row?.yearlyPriceINR)
        ? row!.yearlyPriceINR
        : deriveYearlyPrice(monthlyPriceINR);
      return {
        planId,
        displayName: row?.displayName || fb.displayName,
        monthlyPriceINR,
        yearlyPriceINR,
        enabled: typeof row?.enabled === 'boolean' ? row.enabled : fb.enabled,
        discountPercent: Number.isFinite(row?.discountPercent) ? Math.max(0, Math.min(100, row!.discountPercent)) : fb.discountPercent,
        updatedAt: row?.updatedAt || null,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Admin pricing config error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pricing config' });
  }
};

export const updatePricingConfig = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const planId = req.params.id || req.params.planId;
    const { monthlyPriceINR, yearlyPriceINR, enabled, discountPercent, displayName, reason } = req.body as {
      monthlyPriceINR?: number;
      yearlyPriceINR?: number;
      enabled?: boolean;
      discountPercent?: number;
      displayName?: string;
      reason?: string;
    };

    const update: Record<string, unknown> = {};
    if (typeof monthlyPriceINR === 'number') update.monthlyPriceINR = monthlyPriceINR;
    if (typeof yearlyPriceINR === 'number') update.yearlyPriceINR = yearlyPriceINR;
    if (typeof enabled === 'boolean') update.enabled = enabled;
    if (typeof discountPercent === 'number') update.discountPercent = Math.max(0, Math.min(100, discountPercent));
    if (typeof displayName === 'string' && displayName.trim()) update.displayName = displayName.trim();

    const adminUsername = (req as any).user?.username || 'unknown';
    update.updatedBy = adminUsername;

    const resolvedMonthlyPrice =
      typeof update.monthlyPriceINR === 'number'
        ? (update.monthlyPriceINR as number)
        : (planId === 'advanced' ? 3500 : 2500);
    const resolvedYearlyPrice =
      typeof update.yearlyPriceINR === 'number'
        ? (update.yearlyPriceINR as number)
        : deriveYearlyPrice(resolvedMonthlyPrice);

    const doc = await PricingConfig.findOneAndUpdate(
      { planId },
      {
        $set: {
          planId,
          displayName: update.displayName || (planId === 'advanced' ? 'Advanced' : 'Pro'),
          monthlyPriceINR: resolvedMonthlyPrice,
          yearlyPriceINR: resolvedYearlyPrice,
          enabled: update.enabled ?? true,
          discountPercent: update.discountPercent ?? 0,
          updatedBy: adminUsername,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await AdminAuditLog.create({
      adminUsername,
      action: 'update_pricing',
      targetUserEmail: `pricing:${planId}`,
      reason: reason?.trim() || 'Pricing updated from admin panel',
      changes: {
        planId,
        monthlyPriceINR: doc.monthlyPriceINR,
        yearlyPriceINR: doc.yearlyPriceINR,
        enabled: doc.enabled,
        discountPercent: doc.discountPercent,
      },
    });

    res.json({ success: true, data: doc, message: 'Pricing updated' });
  } catch (err) {
    console.error('Admin update pricing error:', err);
    res.status(500).json({ success: false, error: 'Failed to update pricing config' });
  }
};

export const listDiscountRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = ((req.query.status as string) || 'all').trim();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const q = ((req.query.q as string) || '').trim();

    const filter: Record<string, unknown> = {};
    if (status !== 'all') {
      filter.status = status;
    }
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: 'i' } },
        { reason: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      DiscountRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DiscountRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('Admin list discount requests error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch discount requests' });
  }
};

export const updateDiscountRequest = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const requestId = req.params.id;
    const {
      status,
      offeredDiscountPercent,
      assignedPlan,
      assignToUser,
      planDays,
      adminNotes,
      reason,
    } = req.body as {
      status?: 'pending' | 'approved' | 'rejected';
      offeredDiscountPercent?: number | null;
      assignedPlan?: 'free' | 'pro' | 'advanced' | null;
      assignToUser?: boolean;
      planDays?: number;
      adminNotes?: string | null;
      reason?: string;
    };

    const requestDoc = await DiscountRequest.findById(requestId);
    if (!requestDoc) {
      res.status(404).json({ success: false, error: 'Discount request not found' });
      return;
    }

    if (status) requestDoc.status = status;
    if (offeredDiscountPercent !== undefined) {
      requestDoc.offeredDiscountPercent = offeredDiscountPercent === null
        ? null
        : Math.max(0, Math.min(100, offeredDiscountPercent));
    }
    if (assignedPlan !== undefined) requestDoc.assignedPlan = assignedPlan;
    if (adminNotes !== undefined) requestDoc.adminNotes = adminNotes?.trim() || null;

    const adminUsername = (req as any).user?.username || 'unknown';
    requestDoc.decidedBy = adminUsername;
    requestDoc.decidedAt = new Date();
    await requestDoc.save();

    if (assignToUser && requestDoc.assignedPlan) {
      const user = await User.findOne({ email: requestDoc.email });
      if (user) {
        if (requestDoc.assignedPlan === 'free') {
          user.plan = 'free';
          user.planStartDate = null;
          user.planExpiryDate = null;
          user.aiUsageLimitOverride = null;
          user.uploadUsageLimitOverride = null;
          user.ttsUsageLimitOverride = null;
        } else {
          const now = new Date();
          const expiry = new Date(now);
          expiry.setDate(expiry.getDate() + (planDays || 30));
          user.plan = 'pro';
          user.planStartDate = now;
          user.planExpiryDate = expiry;

          if (requestDoc.assignedPlan === 'advanced') {
            user.aiUsageLimitOverride = 180;
            user.uploadUsageLimitOverride = 350;
            user.ttsUsageLimitOverride = 25;
          } else {
            user.ttsUsageLimitOverride = null;
          }
        }
        await user.save();
      }
    }

    await AdminAuditLog.create({
      adminUsername,
      action: 'discount_request_update',
      targetUserEmail: requestDoc.email,
      reason: reason?.trim() || 'Discount request updated',
      changes: {
        requestId: requestDoc._id,
        status: requestDoc.status,
        offeredDiscountPercent: requestDoc.offeredDiscountPercent,
        assignedPlan: requestDoc.assignedPlan,
        assignToUser: Boolean(assignToUser),
      },
    });

    res.json({ success: true, data: requestDoc, message: 'Discount request updated' });
  } catch (err) {
    console.error('Admin update discount request error:', err);
    res.status(500).json({ success: false, error: 'Failed to update discount request' });
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
    ttsUsageLimitOverride,
    trialTtsNarrationUsed,
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

    const ttsOverride = mapOverride(ttsUsageLimitOverride);
    if (ttsOverride !== undefined) {
      user.ttsUsageLimitOverride = ttsOverride;
    }

    if (typeof trialTtsNarrationUsed === 'boolean') {
      user.trialTtsNarrationUsed = trialTtsNarrationUsed;
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
    let action: 'grant_premium' | 'revoke_premium' | 'reset_usage' | 'set_ai_limit' | 'set_upload_limit' | 'set_tts_trial' = 'reset_usage';
    if (plan === 'pro') action = 'grant_premium';
    else if (plan === 'free') action = 'revoke_premium';
    else if (aiOverride !== undefined) action = 'set_ai_limit';
    else if (uploadOverride !== undefined) action = 'set_upload_limit';
    else if (typeof trialTtsNarrationUsed === 'boolean') action = 'set_tts_trial';

    const adminUsername = (req as any).user?.username || 'unknown';
    const auditReason = reason?.trim() || 'No reason provided';
    const changes = {
      plan: plan ?? null,
      planDays: planDays ?? null,
      aiUsageLimitOverride: aiOverride ?? null,
      uploadUsageLimitOverride: uploadOverride ?? null,
      ttsUsageLimitOverride: ttsOverride ?? null,
      trialTtsNarrationUsed: user.trialTtsNarrationUsed,
      resetUsage: Boolean(resetUsage),
    };

    try {
      await AdminAuditLog.create({
        adminUsername,
        action,
        targetUserId: user._id,
        targetUserEmail: user.email,
        reason: auditReason,
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
        ttsUsageLimitOverride: user.ttsUsageLimitOverride,
        trialTtsNarrationUsed: user.trialTtsNarrationUsed,
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
    const adminUsername = (req as any).user?.username || 'unknown';
    const auditReason = reason?.trim() || 'No reason provided';
    try {
      await AdminAuditLog.create({
        adminUsername,
        action: 'delete_user',
        targetUserId: userBeforeDelete._id,
        targetUserEmail: userBeforeDelete.email,
        reason: auditReason,
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

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  try {
    const q = (req.query.q as string | undefined)?.trim();
    const action = (req.query.action as string | undefined)?.trim();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    const filter: Record<string, any> = {};
    if (action && action !== 'all') {
      filter.action = action;
    }
    if (q) {
      filter.$or = [
        { adminUsername: { $regex: q, $options: 'i' } },
        { targetUserEmail: { $regex: q, $options: 'i' } },
        { reason: { $regex: q, $options: 'i' } },
      ];
    }

    const [logs, total] = await Promise.all([
      AdminAuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('Admin audit logs error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
};

