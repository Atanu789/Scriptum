'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { paymentApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { PlanConfig, SubscriptionInfo, PaymentRecord } from '@/types';
import { Check, X, ChevronDown, Zap, GraduationCap, Building2, Star, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (opts: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; email?: string };
  theme: { color: string };
  handler(response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }): void;
  modal?: { ondismiss?(): void };
}

type PlanEntry = PlanConfig & { id: string };
type DisplayPlan = PlanEntry & {
  description: string;
  ctaLabel: string;
  bestFor: string;
};
type BillingMode = 'monthly' | 'yearly';

const PLAN_COMPARE_ROWS = [
  { label: 'Uploads / month', values: { free: '5', pro: '100', advanced: '350' } },
  { label: 'AI analyses / month', values: { free: '5', pro: '80', advanced: '180' } },
  { label: 'Teleprompter narrations / day', values: { free: 'Trial only', pro: '10', advanced: '25' } },
  { label: 'Grammar fix', values: { free: false, pro: true, advanced: true } },
  { label: 'Humanize text', values: { free: false, pro: true, advanced: true } },
  { label: 'AI teleprompter', values: { free: false, pro: true, advanced: true } },
  { label: 'TTS narration', values: { free: false, pro: true, advanced: true } },
  { label: 'PDF + DOCX export', values: { free: true, pro: true, advanced: true } },
  { label: 'PPTX export', values: { free: false, pro: true, advanced: true } },
  { label: 'Support', values: { free: 'Standard', pro: 'Priority', advanced: 'Priority+' } },
  { label: 'Teams / onboarding', values: { free: false, pro: false, advanced: true } },
] as const;

const SOCIAL_USERS = ['AK', 'RM', 'JS', 'PT', 'LU'];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-sdk')) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PlanFeature({ included, label }: { included: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs leading-tight">
      {included ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <X className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/30" />}
      <span className={included ? 'text-slate-700 dark:text-white/75' : 'text-slate-400 dark:text-white/35'}>{label}</span>
    </li>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const remaining = limit === -1 ? 'Unlimited' : `${Math.max(0, limit - used)} left`;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500 dark:text-white/40">
        <span>{label}</span>
        <span>{limit === -1 ? `${used} / ∞` : `${used} / ${limit}`}</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-white/30">{remaining}</p>
      {limit !== -1 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.12]">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function PlanCompareCell({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <X className="mx-auto h-4 w-4 text-slate-300 dark:text-white/20" />;
  }
  return <span className="text-xs font-semibold text-slate-700 dark:text-white/75">{value}</span>;
}

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [discountEmail, setDiscountEmail] = useState(user?.email || '');
  const [discountReason, setDiscountReason] = useState('');
  const [discountPlan, setDiscountPlan] = useState<'pro' | 'advanced'>('pro');
  const [submittingDiscountRequest, setSubmittingDiscountRequest] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansData, subData] = await Promise.all([
        paymentApi.getPlans(),
        user ? paymentApi.getSubscription() : Promise.resolve(null),
      ]);

      setPlans(Object.entries(plansData).map(([id, cfg]) => ({ ...cfg, id })));
      setSub(subData);

      if (user) {
        setHistory(await paymentApi.getHistory());
      }
    } catch {
      setError('Failed to load plan data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (user?.email) {
      setDiscountEmail(user.email);
    }
  }, [user?.email]);

  const handleUpgrade = async (planId: 'pro' | 'advanced') => {
    if (!user) {
      router.push('/login?redirect=/pricing');
      return;
    }

    try {
      setPaying(true);
      setError('');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load payment SDK. Check your internet connection.');

      const order = await paymentApi.createOrder(planId, billingMode, promoCode.trim() || undefined);

      await new Promise<void>((resolve, reject) => {
        const rz = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'Intern Narrator',
          description: `${planId === 'advanced' ? 'Advanced' : 'Pro'} Plan - ${billingMode === 'yearly' ? 'yearly' : 'monthly'} billing`,
          order_id: order.orderId,
          prefill: { name: user.name, email: user.email },
          theme: { color: '#4f46e5' },
          handler: async (resp) => {
            try {
              await paymentApi.verify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              });
              await fetchData();
              resolve();
            } catch {
              reject(new Error('Payment verification failed. Contact support with your payment ID.'));
            }
          },
          modal: { ondismiss: () => resolve() },
        });

        rz.open();
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const handleRedeem = async () => {
    if (!user) {
      router.push('/login?redirect=/pricing');
      return;
    }

    try {
      setRedeeming(true);
      setError('');
      setSuccessMsg('');
      const data = await paymentApi.redeem(redeemCode);
      setSuccessMsg(data.message);
      setRedeemCode('');
      await fetchData();
    } catch (err) {
      setError((err as Error).message || 'Failed to redeem code');
    } finally {
      setRedeeming(false);
    }
  };

  const handleRequestDiscount = async () => {
    try {
      setSubmittingDiscountRequest(true);
      setError('');
      setSuccessMsg('');
      await paymentApi.requestDiscount({
        email: discountEmail.trim(),
        reason: discountReason.trim(),
        requestedPlan: discountPlan,
      });
      setDiscountReason('');
      setSuccessMsg('Discount request submitted. Our team will contact you on email.');
    } catch (err) {
      setError((err as Error).message || 'Failed to submit discount request');
    } finally {
      setSubmittingDiscountRequest(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </main>
    );
  }

  const activePlan = sub?.plan ?? 'free';
  const expiry = sub?.planExpiryDate ? new Date(sub.planExpiryDate) : null;
  const expired = expiry ? expiry < new Date() : false;
  const effectivePlan = expired ? 'free' : activePlan;
  const isAdvancedActive =
    effectivePlan === 'pro' &&
    ((sub?.limits.aiUsagePerMonth ?? 0) >= 150 || (sub?.limits.uploadsPerMonth ?? 0) >= 200);
    ((sub?.limits.aiUsagePerMonth ?? 0) >= 180 || (sub?.limits.uploadsPerMonth ?? 0) >= 350);
  const activePaidTier = effectivePlan === 'free' ? null : (isAdvancedActive ? 'advanced' : 'pro');
  const activePaidRecord = activePaidTier
    ? history.find((rec) => rec.status === 'captured' && (rec.pricingTier || rec.plan) === activePaidTier)
    : null;
  const activeBillingMode = activePaidRecord?.billingCycle;
  const aiLimitReached = !!sub && sub.limits.aiUsagePerMonth !== -1 && sub.aiUsageThisMonth >= sub.limits.aiUsagePerMonth;
  const uploadLimitReached = !!sub && sub.limits.uploadsPerMonth !== -1 && sub.uploadUsageThisMonth >= sub.limits.uploadsPerMonth;

  const displayPlans: DisplayPlan[] = plans
    .map((plan) => {
      if (plan.id === 'free') {
        return {
          ...plan,
          description: 'Essential tools for getting started.',
          ctaLabel: 'Start free',
          bestFor: 'For individual creators',
        };
      }

      return {
        ...plan,
        description: plan.id === 'advanced'
          ? 'Higher limits and priority support for heavy usage.'
          : '100 uploads, 80 AI analyses, plus full premium toolkit.',
        ctaLabel: plan.id === 'advanced' ? 'Request discount' : 'Upgrade to Pro',
        bestFor: plan.id === 'advanced' ? 'For teams and power users' : 'For regular publishing',
      };
    })
    .filter((plan) => plan.id === 'free' || plan.id === 'pro' || plan.id === 'advanced');

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-violet-50 px-4 py-8 text-slate-900 dark:from-[#090b17] dark:via-[#0d1021] dark:to-[#130e1f] dark:text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        

        <div className="mx-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs shadow-sm dark:border-white/[0.12] dark:bg-white/[0.05]">
          <button
            onClick={() => setBillingMode('monthly')}
            className={cn('rounded-full px-4 py-1.5 font-semibold transition', billingMode === 'monthly' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-white/65')}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingMode('yearly')}
            className={cn('rounded-full px-4 py-1.5 font-semibold transition', billingMode === 'yearly' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-white/65')}
          >
            Yearly <span className="ml-1 text-[10px] text-emerald-300">12 × monthly</span>
          </button>
        </div>

        {error && (
          <div className="mx-auto max-w-md rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mx-auto max-w-md rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            {successMsg}
          </div>
        )}

        {sub && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm',
              effectivePlan === 'pro'
                ? 'border-indigo-300/80 bg-indigo-50/90 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'border-slate-200/80 bg-white/90 text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white/70',
            )}
          >
            <div className="space-y-0.5">
              <p className="font-semibold capitalize">{effectivePlan} plan {expired && activePlan !== 'free' && '(expired)'}</p>
              {expiry && !expired && <p className="text-xs text-slate-500 dark:text-white/35">Renews {expiry.toLocaleDateString()}</p>}
              {expired && activePlan !== 'free' && <p className="text-xs text-amber-500">Your Pro plan expired and moved to Free.</p>}
              {effectivePlan === 'free' && (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-300">
                  ⚠ You have used {sub.aiUsageThisMonth}/{sub.limits.aiUsagePerMonth === -1 ? '∞' : sub.limits.aiUsagePerMonth} AI analyses. Upgrade to continue without limits.
                </p>
              )}
              {(aiLimitReached || uploadLimitReached) && (
                <p className="text-xs font-medium text-red-600 dark:text-red-300">
                  {aiLimitReached && uploadLimitReached
                    ? 'Monthly AI and upload limits reached. Upgrade to continue.'
                    : aiLimitReached
                    ? 'Monthly AI analysis limit reached. Upgrade to continue.'
                    : 'Monthly upload limit reached. Upgrade to continue.'}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <UsageMeter label="AI analyses" used={sub.aiUsageThisMonth} limit={sub.limits.aiUsagePerMonth} />
              <UsageMeter label="Uploads" used={sub.uploadUsageThisMonth} limit={sub.limits.uploadsPerMonth} />
            </div>
          </div>
        )}

        <div className="grid items-stretch gap-4 sm:grid-cols-3">
          {displayPlans.map((plan) => {
            const isPlanTierActive = plan.id === 'advanced' ? isAdvancedActive : effectivePlan === plan.id;
            const isCurrent = plan.id === 'free'
              ? isPlanTierActive
              : isPlanTierActive && (!activeBillingMode || activeBillingMode === billingMode);
            const isPro = plan.id === 'pro';
            const isAdvanced = plan.id === 'advanced';
            const icon = isAdvanced ? <Building2 className="h-4 w-4" /> : plan.id === 'free' ? <GraduationCap className="h-4 w-4" /> : <Zap className="h-4 w-4" />;

            const monthlyPrice = plan.priceINR;
            const yearlyPrice = plan.yearlyPriceINR ?? monthlyPrice * 12;
            const currentPrice = billingMode === 'yearly' ? yearlyPrice : monthlyPrice;
            const dailyPrice = plan.priceINR > 0
              ? billingMode === 'yearly'
                ? Math.max(1, Math.round(yearlyPrice / 365))
                : Math.max(1, Math.round(plan.priceINR / 30))
              : 0;

            return (
              <article
                key={plan.id}
                className={cn(
                  'relative flex h-full flex-col rounded-2xl border bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-[#0f1018]',
                  isPro
                    ? 'border-2 border-indigo-500 shadow-xl shadow-indigo-500/20 md:scale-105 dark:shadow-indigo-500/20'
                    : 'border-slate-200 dark:border-white/[0.08]',
                )}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg">
                    🔥 Most Popular
                  </div>
                )}

                <div className="mb-3 mt-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/40">{plan.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-white/35">{plan.bestFor}</p>
                  </div>
                  <div
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                      isPro ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50',
                    )}
                  >
                    {icon}
                  </div>
                </div>

                <div className="mb-2 space-y-1">
                  {plan.priceINR === 0 ? (
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">₹0</span>
                  ) : (
                    <>
                      <div className="inline-flex items-end gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:ring-emerald-500/30">
                        <span className="text-3xl font-black text-emerald-700 dark:text-emerald-300">
                          ₹{currentPrice}
                        </span>
                        <span className="mb-1 text-xs font-semibold text-emerald-700/80 dark:text-emerald-300/90">/{billingMode === 'yearly' ? 'year' : 'month'}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {billingMode === 'yearly'
                          ? `₹${yearlyPrice}/year (₹${monthlyPrice} × 12 months)`
                          : `₹${monthlyPrice}/month`}
                      </p>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">Approx ₹{dailyPrice} per day</p>
                      {isPro && <p className="text-[11px] font-semibold text-amber-500">⏳ Limited time offer</p>}
                    </>
                  )}
                </div>

                <p className="mb-3 text-xs text-slate-500 dark:text-white/35">{plan.description}</p>

                {isPro && (
                  <div className="mb-3 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">
                      Promo code (optional)
                    </label>
                    <input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter promo code for Pro"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
                    />
                  </div>
                )}

                <ul className="mb-4 flex flex-1 flex-col gap-1.5">
                  {plan.id === 'free' ? (
                    <>
                      <PlanFeature included label="5 uploads per month" />
                      <PlanFeature included label="5 AI analyses per month" />
                      <PlanFeature included={false} label="Grammar fix" />
                      <PlanFeature included={false} label="Humanize text" />
                      <PlanFeature included label="PDF + DOCX export" />
                      <PlanFeature included={false} label="PPTX export" />
                      <PlanFeature included={false} label="AI teleprompter + TTS" />
                    </>
                  ) : plan.id === 'pro' ? (
                    <>
                      <PlanFeature included label="100 uploads per month" />
                      <PlanFeature included label="80 AI analyses per month" />
                      <PlanFeature included label="10 teleprompter narrations per day" />
                      <PlanFeature included label="Grammar fix" />
                      <PlanFeature included label="Humanize text" />
                      <PlanFeature included label="AI teleprompter + TTS" />
                      <PlanFeature included label="PDF + DOCX + PPTX export" />
                    </>
                  ) : (
                    <>
                      <PlanFeature included label="350 uploads per month" />
                      <PlanFeature included label="180 AI analyses per month" />
                      <PlanFeature included label="25 teleprompter narrations per day" />
                      <PlanFeature included label="Grammar fix + Humanize text" />
                      <PlanFeature included label="AI teleprompter + TTS" />
                      <PlanFeature included label="PDF + DOCX + PPTX export" />
                      <PlanFeature included label="Team onboarding" />
                      <PlanFeature included label="Priority+ support" />
                      <PlanFeature included label="Custom billing" />
                    </>
                  )}
                </ul>

                {isCurrent ? (
                  <div className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-white/[0.08] dark:text-white/65">
                    Current plan
                  </div>
                ) : (plan.id === 'pro' || plan.id === 'advanced') ? (
                  <button
                    onClick={() => handleUpgrade(plan.id as 'pro' | 'advanced')}
                    disabled={paying}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 text-center text-xs font-bold text-white transition duration-300 hover:scale-105 hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paying ? 'Processing...' : plan.id === 'advanced' ? '🚀 Upgrade to Advanced' : '🚀 Upgrade to Pro'}
                  </button>
                ) : (
                  <div className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-white/[0.08] dark:text-white/65">
                    Always free
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-center dark:border-white/[0.08] dark:bg-white/[0.05]">
          <p className="text-sm font-semibold text-slate-700 dark:text-white/80">Used by journalists, students, and creators worldwide</p>
          <div className="mt-3 flex items-center justify-center">
            {SOCIAL_USERS.map((name, idx) => (
              <span
                key={name}
                className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-indigo-500 to-violet-500 text-[10px] font-bold text-white first:ml-0 dark:border-[#0d1021]"
                style={{ zIndex: SOCIAL_USERS.length - idx }}
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Have a premium redeem code?</p>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/70">
              Instant activation
            </span>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="Enter code (e.g. FREEPRO2026)"
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !redeemCode.trim()}
              className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redeeming ? 'Applying...' : 'Redeem'}
            </button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-white/80">Request Discount</p>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/70">
              Concession review
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={discountEmail}
              onChange={(e) => setDiscountEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
            />
            <select
              value={discountPlan}
              onChange={(e) => setDiscountPlan(e.target.value as 'pro' | 'advanced')}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
            >
              <option value="pro">Pro</option>
              <option value="advanced">Advanced</option>
            </select>
            <button
              onClick={handleRequestDiscount}
              disabled={submittingDiscountRequest || !discountEmail.trim() || !discountReason.trim()}
              className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingDiscountRequest ? 'Submitting...' : 'Request discount'}
            </button>
          </div>
          <textarea
            value={discountReason}
            onChange={(e) => setDiscountReason(e.target.value)}
            placeholder="Why do you need a concession? (student, startup, bulk seats, etc.)"
            rows={3}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
          />
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white/90 px-5 py-3 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-600 dark:text-white/60">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Razorpay secure payments</span>
            <span>No hidden charges</span>
            <span>Cancel anytime</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <button
            onClick={() => setCompareOpen((v) => !v)}
            className="flex w-full items-center justify-between border-b border-slate-200/80 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/80 dark:hover:bg-white/[0.04]"
          >
            <span>Compact comparison table</span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', compareOpen && 'rotate-180')} />
          </button>

          {compareOpen && (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-slate-200/80 bg-slate-50/80 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Feature</div>
                  <div className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-white/55">Free</div>
                  <div className="bg-indigo-50/80 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">Pro</div>
                  <div className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-white/55">Advanced</div>
                </div>

                {PLAN_COMPARE_ROWS.map((row, index) => (
                  <div
                    key={row.label}
                    className={cn(
                      'grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-slate-100 dark:border-white/[0.06]',
                      index % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/60 dark:bg-white/[0.015]',
                    )}
                  >
                    <div className="px-5 py-3 text-sm font-medium text-slate-700 dark:text-white/80">{row.label}</div>
                    <div className="px-4 py-3 text-center"><PlanCompareCell value={row.values.free} /></div>
                    <div className="bg-indigo-50/60 px-4 py-3 text-center dark:bg-indigo-500/5"><PlanCompareCell value={row.values.pro} /></div>
                    <div className="px-4 py-3 text-center"><PlanCompareCell value={row.values.advanced} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 dark:border-white/[0.08] dark:bg-white/[0.05]">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <span>Payment history ({history.length})</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>

            {historyOpen && (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {history.map((rec) => (
                  <div key={rec._id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                    <div className="space-y-0.5">
                      <p className="font-medium capitalize">{(rec.pricingTier || rec.plan)} plan ({rec.billingCycle})</p>
                      <p className="text-xs text-slate-500 dark:text-white/35">{new Date(rec.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-700 dark:text-white/70">₹{(rec.amount / 100).toFixed(2)}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          rec.status === 'captured'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                            : rec.status === 'failed'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            : rec.status === 'refunded'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-white/40',
                        )}
                      >
                        {rec.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="text-center text-[11px] text-slate-400 dark:text-white/25">
          Need procurement support, GST invoice, or bulk onboarding? Choose Advanced and we will help you set up.
        </p>
      </div>
    </main>
  );
}
