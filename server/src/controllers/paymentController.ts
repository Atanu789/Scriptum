import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User, { Plan } from '../models/User';
import Payment from '../models/Payment';
import PricingConfig, { PricingPlanId } from '../models/PricingConfig';
import DiscountRequest from '../models/DiscountRequest';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  PLAN_LIMITS,
  PLAN_PRICES_PAISE,
  getPlanPriceForCycle,
  BillingCycle,
} from '../services/razorpayService';
import { sendEmail } from '../utils/email';

const PREMIUM_REDEEM_CODE = 'GOFREEULTI';
const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly'];
const PAYMENT_INTERNAL_RECIPIENTS = ['atanugm8@gmail.com', 'gdnvision360@gmail.com'];

const DEFAULT_DYNAMIC_PRICING: Record<PricingPlanId, {
  name: string;
  monthlyPriceINR: number;
  yearlyPriceINR: number;
  enabled: boolean;
  discountPercent: number;
}> = {
  pro: {
    name: 'Pro',
    monthlyPriceINR: 2500,
    yearlyPriceINR: 24000,
    enabled: true,
    discountPercent: 0,
  },
  advanced: {
    name: 'Advanced',
    monthlyPriceINR: 3500,
    yearlyPriceINR: 42000,
    enabled: true,
    discountPercent: 0,
  },
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toPaise(valueINR: number): number {
  return Math.max(0, Math.round(valueINR * 100));
}

function deriveYearlyPrice(monthlyPriceINR: number): number {
  return Math.max(0, Math.round(monthlyPriceINR * 12));
}

async function loadPricingConfigMap(): Promise<Record<PricingPlanId, {
  name: string;
  monthlyPriceINR: number;
  yearlyPriceINR: number;
  enabled: boolean;
  discountPercent: number;
}>> {
  const rows = await PricingConfig.find({ planId: { $in: ['pro', 'advanced'] } }).lean();
  const map = { ...DEFAULT_DYNAMIC_PRICING };

  for (const row of rows) {
    const planId = row.planId as PricingPlanId;
    if (!map[planId]) continue;
    const monthlyPriceINR = Number.isFinite(row.monthlyPriceINR)
      ? Math.max(0, row.monthlyPriceINR)
      : map[planId].monthlyPriceINR;
    const yearlyPriceINR = Number.isFinite(row.yearlyPriceINR)
      ? Math.max(0, row.yearlyPriceINR)
      : deriveYearlyPrice(monthlyPriceINR);
    map[planId] = {
      name: row.displayName || map[planId].name,
      monthlyPriceINR,
      yearlyPriceINR,
      enabled: typeof row.enabled === 'boolean' ? row.enabled : map[planId].enabled,
      discountPercent: clampPercent(Number(row.discountPercent || 0)),
    };
  }

  return map;
}

function getCycleMonths(cycle: BillingCycle): number {
  return cycle === 'yearly' ? 12 : 1;
}

function buildCustomerReceiptText(params: {
  email: string;
  amountPaise: number;
  pricingTier: 'pro' | 'advanced';
  billingCycle: BillingCycle;
  paymentId: string;
  orderId: string;
  paidAt: Date;
  planExpiryDate: Date;
}): string {
  const amountInr = (params.amountPaise / 100).toFixed(2);
  return [
    'Payment Receipt',
    '',
    `Email: ${params.email}`,
    `Plan: ${params.pricingTier.toUpperCase()} (${params.billingCycle})`,
    `Amount Paid: INR ${amountInr}`,
    `Order ID: ${params.orderId}`,
    `Payment ID: ${params.paymentId}`,
    `Paid At: ${params.paidAt.toISOString()}`,
    `Plan Valid Till: ${params.planExpiryDate.toISOString()}`,
    '',
    'Thank you for choosing Scriptum premium.',
  ].join('\n');
}

// ─── GET /api/payment/plans ───────────────────────────────────────────────────

export async function getPlans(_req: Request, res: Response): Promise<void> {
  const pricing = await loadPricingConfigMap();
  const pro = pricing.pro;
  const advanced = pricing.advanced;

  res.json({
    success: true,
    data: {
      free: {
        name:        'Free',
        priceINR:    0,
        priceLabel:  '₹0 / month',
        limits:      PLAN_LIMITS.free,
      },
      pro: {
        name:        pro.name,
        priceINR:    pro.monthlyPriceINR,
        yearlyPriceINR: pro.yearlyPriceINR,
        enabled: pro.enabled,
        discountPercent: pro.discountPercent,
        priceLabel:  `₹${pro.monthlyPriceINR} / month`,
        limits:      PLAN_LIMITS.pro,
      },
      advanced: {
        name: advanced.name,
        priceINR: advanced.monthlyPriceINR,
        yearlyPriceINR: advanced.yearlyPriceINR,
        enabled: advanced.enabled,
        discountPercent: advanced.discountPercent,
        priceLabel: `₹${advanced.monthlyPriceINR} / month`,
        limits: {
          ...PLAN_LIMITS.pro,
          aiUsagePerMonth: 180,
          uploadsPerMonth: 350,
          ttsRequestsPerDay: 25,
        },
      },
    },
  });
}

// ─── POST /api/payment/create-order ──────────────────────────────────────────

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { plan, discountCode, billingCycle } = req.body as {
      plan: 'pro' | 'advanced';
      discountCode?: string;
      billingCycle?: BillingCycle;
    };
    if (!plan || !['pro', 'advanced'].includes(plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan. Supported: pro, advanced' });
      return;
    }

    const normalizedBillingCycle: BillingCycle =
      billingCycle && BILLING_CYCLES.includes(billingCycle) ? billingCycle : 'monthly';

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const pricing = await loadPricingConfigMap();
    const selectedPricing = pricing[plan];
    if (!selectedPricing.enabled) {
      res.status(400).json({ success: false, error: `${selectedPricing.name} plan is currently unavailable` });
      return;
    }

    const baseAmount = normalizedBillingCycle === 'yearly'
      ? toPaise(selectedPricing.yearlyPriceINR)
      : toPaise(selectedPricing.monthlyPriceINR);
    const configuredCode = (process.env.PRO_DISCOUNT_CODE || '').trim();
    const configuredPercentRaw = Number.parseInt(process.env.PRO_DISCOUNT_PERCENT || '10', 10);
    const configuredPercent = Number.isFinite(configuredPercentRaw)
      ? Math.max(0, Math.min(100, configuredPercentRaw))
      : 10;

    const normalizedProvidedCode = (discountCode || '').trim().toUpperCase();
    const normalizedConfiguredCode = configuredCode.toUpperCase();
    const hasValidDiscountCode =
      normalizedProvidedCode.length > 0 &&
      normalizedConfiguredCode.length > 0 &&
      normalizedProvidedCode === normalizedConfiguredCode;

    const mergedDiscountPercent = Math.max(
      hasValidDiscountCode ? configuredPercent : 0,
      clampPercent(selectedPricing.discountPercent),
    );

    const discountPaise = mergedDiscountPercent > 0
      ? Math.round((baseAmount * mergedDiscountPercent) / 100)
      : 0;
    const finalAmount = Math.max(100, baseAmount - discountPaise);

    const order = await createRazorpayOrder('pro', userId, {
      amountPaise: finalAmount,
      notes: {
        pricingTier: plan,
        billingCycle: normalizedBillingCycle,
        ...(hasValidDiscountCode
          ? {
            discountCode: normalizedProvidedCode,
            discountPercent: String(configuredPercent),
            discountPaise: String(discountPaise),
            originalAmountPaise: String(baseAmount),
          }
          : {}),
      },
    });

    // Persist a pending payment record
    await Payment.create({
      userId:           userId,
      plan: 'pro',
      pricingTier: plan,
      billingCycle:     normalizedBillingCycle,
      amount:           order.amount,
      currency:         order.currency,
      razorpayOrderId:  order.orderId,
      status:           'created',
    });

    res.json({
      success: true,
      data: {
        orderId:  order.orderId,
        amount:   order.amount,
        currency: order.currency,
        keyId:    process.env.RAZORPAY_KEY_ID,
        originalAmount: baseAmount,
        discountPaise,
        discountPercent: mergedDiscountPercent,
        billingCycle: normalizedBillingCycle,
      },
    });
  } catch (err) {
    console.error('createOrder error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create payment order';
    if (message.toLowerCase().includes('razorpay credentials not configured')) {
      res.status(503).json({ success: false, error: 'Payment gateway is not configured' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create payment order' });
  }
}

// ─── POST /api/payment/discount-request ─────────────────────────────────────

export async function requestDiscount(req: Request, res: Response): Promise<void> {
  try {
    const { email, reason, requestedPlan } = req.body as {
      email?: string;
      reason?: string;
      requestedPlan?: 'pro' | 'advanced';
    };

    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedReason = (reason || '').trim();
    const normalizedPlan: 'pro' | 'advanced' = requestedPlan === 'advanced' ? 'advanced' : 'pro';

    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      res.status(400).json({ success: false, error: 'Please provide a valid email address' });
      return;
    }

    if (normalizedReason.length < 10) {
      res.status(400).json({ success: false, error: 'Reason must be at least 10 characters' });
      return;
    }

    await DiscountRequest.create({
      email: normalizedEmail,
      reason: normalizedReason,
      requestedPlan: normalizedPlan,
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      data: {
        email: normalizedEmail,
        requestedPlan: normalizedPlan,
        status: 'pending',
      },
      message: 'Discount request submitted. Our team will review it shortly.',
    });
  } catch (err) {
    console.error('requestDiscount error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit discount request' });
  }
}

// ─── POST /api/payment/verify ─────────────────────────────────────────────────

export async function verifyPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body as {
        razorpay_order_id:  string;
        razorpay_payment_id: string;
        razorpay_signature:  string;
      };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ success: false, error: 'Missing payment fields' });
      return;
    }

    // ── Signature verification (critical — never trust frontend) ───────────
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      res.status(400).json({ success: false, error: 'Payment signature verification failed' });
      return;
    }

    // ── Retrieve pending payment record ────────────────────────────────────
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id, userId });
    if (!payment) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    const user = await User.findById(userId).select('email');

    // ── Activate subscription ──────────────────────────────────────────────
    const now   = new Date();
    const expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + getCycleMonths(payment.billingCycle ?? 'monthly'));

    const pricingTier = payment.pricingTier === 'advanced' ? 'advanced' : 'pro';
    const isAdvanced = pricingTier === 'advanced';

    await User.findByIdAndUpdate(userId, {
      plan:                'pro',
      planStartDate:        now,
      planExpiryDate:       expiry,
      razorpayPaymentId:    razorpay_payment_id,
      aiUsageThisMonth:     0,
      uploadUsageThisMonth: 0,
      aiUsageResetAt:       now,
      ttsUsageToday:        0,
      ttsUsageDate:         now,
      aiUsageLimitOverride: isAdvanced ? 180 : null,
      uploadUsageLimitOverride: isAdvanced ? 350 : null,
      ttsUsageLimitOverride: isAdvanced ? 25 : null,
    });

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.status            = 'captured';
    await payment.save();

    const receiptText = [
      'New Payment Received',
      '',
      `User: ${user?.email || 'unknown'}`,
      `Amount: \u20b9${(payment.amount / 100).toFixed(2)}`,
      `Plan: ${pricingTier}`,
      `Billing Cycle: ${payment.billingCycle ?? 'monthly'}`,
      `Date: ${now.toISOString()}`,
      `Payment ID: ${razorpay_payment_id}`,
      `Order ID: ${razorpay_order_id}`,
    ].join('\n');

    if (user?.email) {
      const customerReceiptText = buildCustomerReceiptText({
        email: user.email,
        amountPaise: payment.amount,
        pricingTier,
        billingCycle: payment.billingCycle ?? 'monthly',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        paidAt: now,
        planExpiryDate: expiry,
      });

      const customerReceiptResult = await sendEmail({
        to: user.email,
        subject: `Your Scriptum ${pricingTier.toUpperCase()} Payment Receipt`,
        text: customerReceiptText,
        html: `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif">${customerReceiptText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre>`,
      });

      if (!customerReceiptResult.sent) {
        console.warn('Customer payment receipt email failed:', customerReceiptResult.reason || 'unknown');
      }
    }

    const receiptEmailResult = await sendEmail({
      to: PAYMENT_INTERNAL_RECIPIENTS,
      subject: `New Payment Received - ${pricingTier.toUpperCase()}`,
      text: receiptText,
      html: `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif">${receiptText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`,
    });

    if (!receiptEmailResult.sent) {
      console.warn('Payment receipt email failed:', receiptEmailResult.reason || 'unknown');
    }

    res.json({
      success: true,
      data: {
        plan:            pricingTier,
        planExpiryDate:  expiry,
        message:         `${pricingTier.toUpperCase()} plan activated — valid until ${expiry.toLocaleDateString()}`,
      },
    });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ success: false, error: 'Payment verification failed' });
  }
}

// ─── POST /api/payment/redeem ───────────────────────────────────────────────

export async function redeemCode(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { code } = req.body as { code?: string };
    const normalized = (code || '').trim().toUpperCase();

    if (!normalized) {
      res.status(400).json({ success: false, error: 'Please enter a redeem code' });
      return;
    }

    if (normalized !== PREMIUM_REDEEM_CODE) {
      res.status(400).json({ success: false, error: 'Invalid redeem code' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    if (user.plan === 'pro' && user.planExpiryDate && user.planExpiryDate > new Date()) {
      res.status(200).json({
        success: true,
        data: {
          plan: 'pro',
          planExpiryDate: user.planExpiryDate,
          message: `Pro already active until ${user.planExpiryDate.toLocaleDateString()}`,
        },
      });
      return;
    }

    const now = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 30);

    user.plan = 'pro';
    user.planStartDate = now;
    user.planExpiryDate = expiry;
    user.aiUsageThisMonth = 0;
    user.uploadUsageThisMonth = 0;
    user.aiUsageResetAt = now;
    user.ttsUsageToday = 0;
    user.ttsUsageDate = now;
    user.ttsUsageLimitOverride = null;
    await user.save();

    await Payment.create({
      userId,
      plan: 'pro',
      pricingTier: 'pro',
      billingCycle: 'monthly',
      amount: 0,
      currency: 'INR',
      razorpayOrderId: `redeem_${userId.slice(-8)}_${Date.now()}`,
      razorpayPaymentId: `coupon_${PREMIUM_REDEEM_CODE}`,
      status: 'captured',
    });

    res.json({
      success: true,
      data: {
        plan: 'pro',
        planExpiryDate: expiry,
        message: `Redeem successful. Pro activated until ${expiry.toLocaleDateString()}`,
      },
    });
  } catch (err) {
    console.error('redeemCode error:', err);
    res.status(500).json({ success: false, error: 'Could not redeem code' });
  }
}

// ─── GET /api/payment/subscription ───────────────────────────────────────────

export async function getSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const user = await User.findById(userId).select(
      'plan planStartDate planExpiryDate aiUsageThisMonth uploadUsageThisMonth aiUsageLimitOverride uploadUsageLimitOverride ttsUsageLimitOverride trialTtsNarrationUsed trialExportUsed trialAiOverageUsed trialUploadOverageUsed'
    );
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const isActive =
      user.plan === 'free' ||
      (user.planExpiryDate !== null && user.planExpiryDate > new Date());

    res.json({
      success: true,
      data: {
        plan:                  user.plan,
        planStartDate:         user.planStartDate,
        planExpiryDate:        user.planExpiryDate,
        isActive,
        aiUsageThisMonth:      user.aiUsageThisMonth,
        uploadUsageThisMonth:  user.uploadUsageThisMonth,
        limits: {
          ...PLAN_LIMITS[user.plan],
          aiUsagePerMonth:
            typeof user.aiUsageLimitOverride === 'number'
              ? user.aiUsageLimitOverride
              : PLAN_LIMITS[user.plan].aiUsagePerMonth,
          uploadsPerMonth:
            typeof user.uploadUsageLimitOverride === 'number'
              ? user.uploadUsageLimitOverride
              : PLAN_LIMITS[user.plan].uploadsPerMonth,
          ttsRequestsPerDay:
            typeof user.ttsUsageLimitOverride === 'number'
              ? user.ttsUsageLimitOverride
              : PLAN_LIMITS[user.plan].ttsRequestsPerDay,
        },
        trials: {
          ttsNarration: {
            used: user.trialTtsNarrationUsed,
            available: user.plan === 'free' && !user.trialTtsNarrationUsed,
          },
          export: {
            used: user.trialExportUsed,
            available: user.plan === 'free' && !user.trialExportUsed,
          },
          aiOverage: {
            used: user.trialAiOverageUsed,
            available: user.plan === 'free' && !user.trialAiOverageUsed,
          },
          uploadOverage: {
            used: user.trialUploadOverageUsed,
            available: user.plan === 'free' && !user.trialUploadOverageUsed,
          },
        },
      },
    });
  } catch (err) {
    console.error('getSubscription error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch subscription' });
  }
}

// ─── GET /api/payment/history ─────────────────────────────────────────────────

export async function getPaymentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-__v');

    res.json({ success: true, data: payments });
  } catch (err) {
    console.error('getPaymentHistory error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch payment history' });
  }
}

// ─── POST /api/payment/webhook ────────────────────────────────────────────────
// Must be mounted with raw body parser (express.raw) so signature can be verified.

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    const sig = req.headers['x-razorpay-signature'] as string | undefined;
    if (!sig) { res.status(400).json({ success: false, error: 'Missing webhook signature' }); return; }

    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    const isValid = verifyWebhookSignature(rawBody, sig);
    if (!isValid) { res.status(400).json({ success: false, error: 'Webhook signature invalid' }); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = req.body as { event: string; payload?: any };

    if (event.event === 'payment.captured') {
      const paymentId = event.payload?.payment?.entity?.id as string | undefined;
      const orderId   = event.payload?.payment?.entity?.order_id as string | undefined;
      if (paymentId && orderId) {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: orderId },
          { razorpayPaymentId: paymentId, status: 'captured' }
        );
      }
    }

    if (event.event === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id as string | undefined;
      if (orderId) {
        await Payment.findOneAndUpdate({ razorpayOrderId: orderId }, { status: 'failed' });
      }
    }

    if (event.event === 'refund.created') {
      const paymentId = event.payload?.refund?.entity?.payment_id as string | undefined;
      if (paymentId) {
        const payment = await Payment.findOneAndUpdate(
          { razorpayPaymentId: paymentId },
          { status: 'refunded' },
          { new: true }
        );
        if (payment?.userId) {
          await User.findByIdAndUpdate(payment.userId, {
            plan:            'free',
            planStartDate:    null,
            planExpiryDate:   null,
            razorpayPaymentId: null,
          });
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('webhook error:', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
}
