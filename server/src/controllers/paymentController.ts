import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import User, { Plan } from '../models/User';
import Payment from '../models/Payment';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  PLAN_LIMITS,
  PLAN_PRICES_PAISE,
} from '../services/razorpayService';

const PREMIUM_REDEEM_CODE = 'GOFREEULTI';

// ─── GET /api/payment/plans ───────────────────────────────────────────────────

export async function getPlans(_req: Request, res: Response): Promise<void> {
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
        name:        'Pro',
        priceINR:    PLAN_PRICES_PAISE.pro / 100,
        priceLabel:  '₹499 / month',
        limits:      PLAN_LIMITS.pro,
      },
    },
  });
}

// ─── POST /api/payment/create-order ──────────────────────────────────────────

export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { plan, discountCode } = req.body as { plan: string; discountCode?: string };
    if (!plan || !['pro'].includes(plan)) {
      res.status(400).json({ success: false, error: 'Invalid plan. Supported: pro' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    // Reject duplicate active subscription
    if (user.plan === plan && user.planExpiryDate && user.planExpiryDate > new Date()) {
      res.status(400).json({ success: false, error: `You already have an active ${plan} subscription` });
      return;
    }

    const baseAmount = PLAN_PRICES_PAISE[plan as Exclude<Plan, 'free'>];
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

    const discountPaise = hasValidDiscountCode
      ? Math.round((baseAmount * configuredPercent) / 100)
      : 0;
    const finalAmount = Math.max(100, baseAmount - discountPaise);

    const order = await createRazorpayOrder(plan as Exclude<Plan, 'free'>, userId, {
      amountPaise: finalAmount,
      notes: hasValidDiscountCode
        ? {
            discountCode: normalizedProvidedCode,
            discountPercent: String(configuredPercent),
            discountPaise: String(discountPaise),
            originalAmountPaise: String(baseAmount),
          }
        : undefined,
    });

    // Persist a pending payment record
    await Payment.create({
      userId:           userId,
      plan,
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
        discountPercent: hasValidDiscountCode ? configuredPercent : 0,
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

    // ── Activate subscription ──────────────────────────────────────────────
    const now   = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 30);

    await User.findByIdAndUpdate(userId, {
      plan:                payment.plan,
      planStartDate:        now,
      planExpiryDate:       expiry,
      razorpayPaymentId:    razorpay_payment_id,
      aiUsageThisMonth:     0,
      uploadUsageThisMonth: 0,
      aiUsageResetAt:       now,
    });

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.status            = 'captured';
    await payment.save();

    res.json({
      success: true,
      data: {
        plan:            payment.plan,
        planExpiryDate:  expiry,
        message:         `${payment.plan.toUpperCase()} plan activated — valid until ${expiry.toLocaleDateString()}`,
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
    await user.save();

    await Payment.create({
      userId,
      plan: 'pro',
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
      'plan planStartDate planExpiryDate aiUsageThisMonth uploadUsageThisMonth aiUsageLimitOverride uploadUsageLimitOverride trialTtsNarrationUsed trialExportUsed trialAiOverageUsed trialUploadOverageUsed'
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
