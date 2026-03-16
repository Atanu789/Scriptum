'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { paymentApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { PlanConfig, SubscriptionInfo, PaymentRecord } from '@/types';
import {
  Check, X, ChevronDown, Zap, GraduationCap, Building2,
  Sparkles, ShieldCheck, FileOutput,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BorderBeam } from '@/components/ui/border-beam';
import { BackgroundDots, BackgroundGrid } from '@/components/ui/background-dots';

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
  isPremium?: boolean;
};

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-sdk')) { resolve(true); return; }
    const s = document.createElement('script');
    s.id = 'razorpay-sdk';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlanFeature({ included, label }: { included: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {included
        ? <Check className="h-4 w-4 shrink-0 text-emerald-500" />
        : <X className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/30" />}
      <span className={included ? 'text-slate-700 dark:text-white/75' : 'text-slate-400 dark:text-white/35'}>{label}</span>
    </li>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500 dark:text-white/40">
        <span>{label}</span>
        <span>{limit === -1 ? `${used} / ∞` : `${used} / ${limit}`}</span>
      </div>
      {limit !== -1 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.12]">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansData, subData] = await Promise.all([
        paymentApi.getPlans(),
        user ? paymentApi.getSubscription() : Promise.resolve(null),
      ]);
      setPlans(Object.entries(plansData).map(([id, cfg]) => ({ ...cfg, id })));
      setSub(subData);
      if (user) setHistory(await paymentApi.getHistory());
    } catch {
      setError('Failed to load plan data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Checkout flow ───────────────────────────────────────────────────────────

  const handleUpgrade = async () => {
    if (!user) { router.push('/login?redirect=/pricing'); return; }
    try {
      setPaying(true);
      setError('');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load payment SDK. Check your internet connection.');

      const order = await paymentApi.createOrder('pro');

      await new Promise<void>((resolve, reject) => {
        const rz = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'Intern Narrator',
          description: 'Pro Plan — monthly subscription',
          order_id: order.orderId,
          prefill: { name: user.name, email: user.email },
          theme: { color: '#6d28d9' },
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

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white dark:bg-[#09090f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </main>
    );
  }

  const activePlan = sub?.plan ?? 'free';
  const expiry = sub?.planExpiryDate ? new Date(sub.planExpiryDate) : null;
  const expired = expiry ? expiry < new Date() : false;
  const effectivePlan = expired ? 'free' : activePlan;

  const customPlan: DisplayPlan = {
    id: 'custom',
    name: 'Custom',
    priceINR: 0,
    priceLabel: 'Talk to sales',
    limits: {
      aiUsagePerMonth: -1,
      uploadsPerMonth: -1,
      teleprompterAI: true,
      exportPPT: true,
      ttsNarration: true,
    },
    description: 'Tailored plan for institutes and teams.',
    ctaLabel: 'Contact sales',
    bestFor: 'Best for teams and institutes',
  };

  const displayPlans: DisplayPlan[] = plans
    .map((plan) => {
      if (plan.id === 'free') {
        return {
          ...plan,
          description: 'For individuals exploring AI tools.',
          ctaLabel: 'Start free',
          bestFor: 'Best for getting started',
        };
      }
      return {
        ...plan,
        description: 'Full AI power for daily use.',
        ctaLabel: `Go premium - Rs.${plan.priceINR}/month`,
        bestFor: 'Best for power users',
        isPremium: true,
      };
    })
    .concat(customPlan);

  return (
    <main className="relative min-h-screen overflow-hidden bg-white px-4 py-16 text-slate-900 dark:bg-[#09090f] dark:text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40 dark:opacity-20"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(99,102,241,0.32) 0%, transparent 80%)' }}
      />
      <BackgroundDots gap={22} dotSize={1} className="opacity-60 dark:opacity-100" />
      <BackgroundGrid isDark className="hidden dark:block" />
      <div aria-hidden className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-72 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="mx-auto max-w-6xl space-y-12">

        {/* Header */}
        <header className="text-center space-y-3">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-0.5 text-[11px] font-semibold text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Zap className="h-3.5 w-3.5" /> Pricing
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Choose your plan</h1>
          <p className="mx-auto max-w-2xl text-slate-500 dark:text-white/35">
            Transparent plans for creators, learners, and teams. Upgrade anytime to unlock premium narration,
            PowerPoint export, and advanced AI workflows.
          </p>
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
        </header>

        <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/35">Have a premium redeem code?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="Enter code (e.g. FREEPRO2026)"
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white/80 dark:focus:border-indigo-500/50"
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !redeemCode.trim()}
              className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redeeming ? 'Applying...' : 'Redeem'}
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05]">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-500 dark:text-indigo-400">
              <Sparkles className="h-3.5 w-3.5" /> AI Stack
            </p>
            <p className="text-sm text-slate-600 dark:text-white/60">Humanize, grammar fixes, and analysis scoring in one flow.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05]">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-500 dark:text-indigo-400">
              <FileOutput className="h-3.5 w-3.5" /> Export Ready
            </p>
            <p className="text-sm text-slate-600 dark:text-white/60">PDF and DOCX for all, PPTX unlocked on Pro and above.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05]">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-500 dark:text-indigo-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure Billing
            </p>
            <p className="text-sm text-slate-600 dark:text-white/60">Razorpay-protected payments with easy cancellation anytime.</p>
          </div>
        </section>

        {/* Active-plan banner */}
        {sub && (
          <div className={`rounded-xl border px-5 py-4 text-sm flex flex-wrap items-center justify-between gap-3
            ${effectivePlan === 'pro'
              ? 'border-indigo-300/80 bg-indigo-50/70 text-indigo-700 backdrop-blur-xl dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300'
              : 'border-slate-200/80 bg-white/65 text-slate-700 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white/70'}`}>
            <div className="space-y-0.5">
              <p className="font-semibold capitalize">{effectivePlan} Plan {expired && activePlan !== 'free' && '(expired)'}</p>
              {expiry && !expired && (
                <p className="text-slate-500 text-xs dark:text-white/35">Renews {expiry.toLocaleDateString()}</p>
              )}
              {expired && activePlan !== 'free' && (
                <p className="text-amber-400 text-xs">Your Pro plan expired — you have been moved to Free.</p>
              )}
            </div>
            <div className="flex gap-6">
              <UsageMeter label="AI uses" used={sub.aiUsageThisMonth} limit={sub.limits.aiUsagePerMonth} />
              <UsageMeter label="Uploads" used={sub.uploadUsageThisMonth} limit={sub.limits.uploadsPerMonth} />
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid items-stretch gap-4 sm:grid-cols-3">
          {displayPlans.map((plan) => {
            const isCurrent = effectivePlan === plan.id;
            const isPro = plan.id === 'pro';
            const isCustom = plan.id === 'custom';
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-2xl border p-5',
                  isPro
                    ? 'border-indigo-400/50 bg-white/80 shadow-xl shadow-indigo-500/15 backdrop-blur-xl dark:border-indigo-500/40 dark:bg-[#0d0d1a]/85'
                    : 'border-slate-200/90 bg-white/65 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0e0e16]/80',
                )}
              >
                {isPro && <BorderBeam duration={8} colorFrom="#6366f1" colorTo="#a855f7" />}
                {isPro && (
                  <span className="absolute left-1/2 -top-px -translate-x-1/2 rounded-b-full bg-indigo-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}

                {/* Plan name + price */}
                <div>
                  <div className={cn(
                    'mb-3 mt-3 inline-flex h-8 w-8 items-center justify-center rounded-xl',
                    isPro ? 'bg-indigo-600 shadow-md shadow-indigo-500/30' : 'bg-slate-100 dark:bg-white/[0.06]',
                  )}>
                    {isCustom ? <Building2 className={cn('h-4 w-4', isPro ? 'text-white' : 'text-slate-500 dark:text-white/40')} />
                      : plan.id === 'free' ? <GraduationCap className={cn('h-4 w-4', isPro ? 'text-white' : 'text-slate-500 dark:text-white/40')} />
                      : <Zap className={cn('h-4 w-4', isPro ? 'text-white' : 'text-slate-500 dark:text-white/40')} />}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/25">{plan.name}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-white/35">{plan.bestFor}</p>
                  <div className="mt-2 flex items-end gap-1">
                    {isCustom ? (
                      <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Custom</span>
                    ) : plan.priceINR === 0 ? (
                      <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">₹0</span>
                    ) : (
                      <>
                        <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">₹{plan.priceINR}</span>
                        <span className="mb-0.5 text-xs text-slate-400 dark:text-white/25">/month</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/30">{plan.description}</p>
                </div>

                <div className={cn('my-4 h-px', isPro ? 'bg-indigo-100 dark:bg-indigo-500/15' : 'bg-slate-100 dark:bg-white/[0.05]')} />

                {/* Feature list */}
                <ul className="flex flex-1 flex-col gap-2">
                  <PlanFeature included label={`${plan.limits.aiUsagePerMonth === -1 ? 'Unlimited' : plan.limits.aiUsagePerMonth} AI uses / month`} />
                  <PlanFeature included label={`${plan.limits.uploadsPerMonth === -1 ? 'Unlimited' : plan.limits.uploadsPerMonth} document uploads`} />
                  <PlanFeature included={plan.limits.teleprompterAI} label="AI-powered teleprompter" />
                  <PlanFeature included={plan.limits.exportPPT} label="Export to PowerPoint" />
                  <PlanFeature included={plan.limits.ttsNarration} label="Text-to-speech narration" />
                  <PlanFeature included={isPro} label="Priority support" />
                </ul>

                {/* CTA */}
                <div>
                  {isCurrent ? (
                    <div className="mt-5 block rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:border-white/[0.08] dark:text-white/55">
                      Current plan
                    </div>
                  ) : isCustom ? (
                    <Link
                      href="mailto:sales@ultimoversio.com?subject=Custom%20Plan%20Inquiry"
                      className="mt-5 block rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/55 dark:hover:bg-white/[0.05]"
                    >
                      Contact sales
                    </Link>
                  ) : isPro ? (
                    <button
                      onClick={handleUpgrade}
                      disabled={paying}
                      className="mt-5 block w-full rounded-xl bg-indigo-600 px-4 py-2 text-center text-xs font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-500 active:scale-[0.97]
                        disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {paying ? 'Processing...' : plan.ctaLabel}
                    </button>
                  ) : (
                    <div className="mt-5 block rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-slate-700 dark:border-white/[0.08] dark:text-white/55">
                      Always free
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust strip */}
        <div className="flex flex-wrap justify-center gap-8 text-slate-500 text-xs dark:text-white/30">
          <span>256-bit encrypted payments via Razorpay</span>
          <span>Cancel anytime</span>
          <span>Supports UPI, cards, net banking and wallets</span>
          <span>Made for Indian learners</span>
        </div>

        {/* Payment history accordion */}
        {history.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/65 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.05]">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between px-6 py-4 text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <span>Payment history ({history.length})</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
            {historyOpen && (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {history.map((rec) => (
                  <div key={rec._id} className="flex flex-wrap items-center justify-between px-6 py-3 text-sm gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium capitalize">{rec.plan} Plan</p>
                      <p className="text-slate-500 text-xs dark:text-white/35">{new Date(rec.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-700 dark:text-white/70">₹{(rec.amount / 100).toFixed(2)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium
                        ${rec.status === 'captured' ? 'bg-emerald-900 text-emerald-300'
                          : rec.status === 'failed' ? 'bg-red-900 text-red-300'
                          : rec.status === 'refunded' ? 'bg-amber-900 text-amber-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-white/40'}`}>
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
          Need procurement support, GST invoice, or bulk onboarding? Use Custom plan and we will help you set up.
        </p>

      </div>
    </main>
  );
}
