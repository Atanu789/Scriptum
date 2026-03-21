// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require('razorpay') as new (opts: { key_id: string; key_secret: string }) => {
  orders: {
    create(opts: object): Promise<{ id: string; amount: number; currency: string }>;
  };
};
import crypto from 'crypto';
import { Plan } from '../models/User';

export type BillingCycle = 'monthly' | 'yearly';

function safeCompareHex(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// ─── Plan config ──────────────────────────────────────────────────────────────

export const PLAN_PRICES_PAISE: Record<Exclude<Plan, 'free'>, number> = {
  pro: 250000, // ₹2500
};

const PLAN_YEARLY_PRICES_PAISE: Record<Exclude<Plan, 'free'>, number> = {
  pro: 2400000, // ₹24000
};

export function getPlanPriceForCycle(
  plan: Exclude<Plan, 'free'>,
  billingCycle: BillingCycle,
): number {
  if (billingCycle === 'yearly') {
    return PLAN_YEARLY_PRICES_PAISE[plan];
  }
  return PLAN_PRICES_PAISE[plan];
}

export const PLAN_LIMITS: { [P in Plan]: {
  aiUsagePerMonth:   number;   // -1 = unlimited
  uploadsPerMonth:   number;   // -1 = unlimited
  teleprompterAI:    boolean;
  exportPPT:         boolean;
  ttsNarration:      boolean;
  grammarFix:        boolean;
  humanizeText:      boolean;
} } = {
  free: {
    aiUsagePerMonth:  5,
    uploadsPerMonth:  5,
    teleprompterAI:   false,
    exportPPT:        false,
    ttsNarration:     false,
    grammarFix:       false,
    humanizeText:     false,
  },
  pro: {
    aiUsagePerMonth:  50,
    uploadsPerMonth:  50,
    teleprompterAI:   true,
    exportPPT:        true,
    ttsNarration:     true,
    grammarFix:       true,
    humanizeText:     true,
  },
};

// ─── Razorpay singleton ───────────────────────────────────────────────────────

function getRazorpayInstance(): InstanceType<typeof Razorpay> {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay credentials not configured');
  return new Razorpay({ key_id, key_secret });
}

// ─── Create order ─────────────────────────────────────────────────────────────

export async function createRazorpayOrder(
  plan: Exclude<Plan, 'free'>,
  userId: string,
  opts?: { amountPaise?: number; notes?: Record<string, string> },
) {
  const amount = opts?.amountPaise ?? PLAN_PRICES_PAISE[plan];
  const rp = getRazorpayInstance();

  const order = await rp.orders.create({
    amount,
    currency: 'INR',
    receipt: `rcpt_${userId.slice(-8)}_${Date.now()}`,
    notes: { plan, userId, ...(opts?.notes ?? {}) },
  });

  return { orderId: order.id, amount, currency: order.currency };
}

// ─── Verify signature ─────────────────────────────────────────────────────────

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error('RAZORPAY_KEY_SECRET not set');

  const body     = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return safeCompareHex(expected, razorpaySignature);
}

// ─── Verify webhook signature ─────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not set');

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompareHex(expected, signature);
}
