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

    const { plan } = req.body as { plan: string };
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

    const order = await createRazorpayOrder(plan as Exclude<Plan, 'free'>, userId);

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
      },
    });
  } catch (err) {
    console.error('createOrder error:', err);
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

// ─── GET /api/payment/subscription ───────────────────────────────────────────

export async function getSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const user = await User.findById(userId).select(
      'plan planStartDate planExpiryDate aiUsageThisMonth uploadUsageThisMonth'
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
        limits:                PLAN_LIMITS[user.plan],
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
