'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import {
  BookOpen, Sun, Moon, CheckCircle2, ArrowRight,
  FileText, Mic2, Brain, ShieldCheck, Download,
  Upload, Wand2, GraduationCap, Sparkles, Zap, Building2,
  Star, ChevronRight, LayoutGrid, FileOutput, ScanText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Footer } from '@/components/ui/footer';
import { SpotlightCard } from '@/components/ui/spotlight';
import { BackgroundDots, BackgroundGrid } from '@/components/ui/background-dots';
import { MeteorCard, GlowCard } from '@/components/ui/meteor-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { NumberTicker } from '@/components/ui/number-ticker';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   LANDING NAVBAR
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function LandingNav() {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#09090f]/80'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-500/30 transition-colors group-hover:bg-indigo-500">
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Ultimoversio</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-500 dark:text-white/40 md:flex">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
          <Link href="/pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</Link>
        </nav>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/30 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/[0.05] dark:hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   HERO
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STATS = [
  { value: 10000, suffix: '+', label: 'Documents' },
  { value: 99.2, suffix: '%', label: 'Grammar accuracy', decimals: 1 },
  { value: 6, suffix: '', label: 'Export formats' },
  { value: 3, suffix: 'x', label: 'Faster editing' },
];

function HeroSection() {
  return (
    <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-5 pt-20 pb-12">
      {/* Top indigo glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40 dark:opacity-25"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(99,102,241,0.35) 0%, transparent 80%)' }}
      />

      {/* Aceternity dot-grid background */}
      <BackgroundDots gap={22} dotSize={1} className="dark:opacity-100 opacity-60" />

      {/* Subtle line grid (dark mode only) */}
      <BackgroundGrid isDark className="hidden dark:block" />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Badge */}
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3 py-0.5 backdrop-blur-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-600">
            <Sparkles className="h-2 w-2 text-white" />
          </span>
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">AI-Powered Document Intelligence</span>
          <ChevronRight className="h-3 w-3 text-indigo-400" />
        </div>

        {/* Headline */}
        <h1 className="text-[2.75rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
          Write. Analyse.{' '}
          <span
            className="bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-x_4s_ease_infinite]"
          >
            Present.
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-500 dark:text-white/40">
          Upload any document — Ultimoversio runs deep AI analysis, fixes grammar, detects plagiarism, and delivers
          polished exports in seconds.
        </p>

        {/* CTAs */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Start for free
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]"
          >
            See features
          </a>
        </div>

        {/* Stats strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 border-y border-slate-100 py-5 dark:border-white/[0.06]">
          {STATS.map(({ value, suffix, label, decimals }) => (
            <div key={label} className="flex flex-col items-center gap-0.5 min-w-[64px]">
              <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                <NumberTicker value={value} decimals={decimals} />
                {suffix}
              </span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-white/25">{label}</span>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          ))}
          <span className="ml-1 text-xs text-slate-400 dark:text-white/25">Rated 4.9 / 5 by early users</span>
        </div>
      </div>
    </section>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   BENTO FEATURES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function FeaturesSection() {
  return (
    <section id="features" className="relative px-5 pb-14 pt-4 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section label */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Features</span>
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/[0.06]" />
          <h2 className="text-sm font-semibold text-slate-500 dark:text-white/30">Everything in one workspace</h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

          {/* Cell 1 â€” large: AI Analysis */}
          <GlowCard className="lg:col-span-2 p-6">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
              <Brain className="h-4.5 w-4.5 h-[18px] w-[18px] text-violet-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Deep AI Analysis</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-white/35">
              Gemini scoring, AI-human detector confidence, readability + tone insights, and instant structure suggestions.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['AI score', 'Readability', 'Tone', 'Topics'].map((t) => (
                <span key={t} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-600 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400">
                  {t}
                </span>
              ))}
            </div>
          </GlowCard>

          {/* Cell 2 â€” Grammar */}
          <SpotlightCard className="p-5">
            <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Grammar & Style</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-white/35">
              One-click grammar fixes, line-numbered issues, and side-by-side word diff before apply.
            </p>
          </SpotlightCard>

          {/* Cell 3 â€” Plagiarism */}
          <SpotlightCard className="p-5">
            <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-500/10">
              <ScanText className="h-4 w-4 text-orange-500" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Plagiarism Detection</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-white/35">
              Fast similarity scan with cleaner trust-style verdict messaging.
            </p>
          </SpotlightCard>

          {/* Cell 4 â€” Upload */}
          <SpotlightCard className="p-5">
            <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
              <Upload className="h-4 w-4 text-indigo-500" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Smart Upload</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-white/35">
              PDF, DOCX, PPTX, image, audio, video, and URL ingestion with auto-normalized content.
            </p>
          </SpotlightCard>

          {/* Cell 5 â€” Export */}
          <SpotlightCard className="p-5">
            <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-pink-50 dark:bg-pink-500/10">
              <FileOutput className="h-4 w-4 text-pink-500" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Flexible Export</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-white/35">
              Export to PDF, DOCX, PPTX with premium gates and polished share-ready output.
            </p>
          </SpotlightCard>

          {/* Cell 6 â€” large: Teleprompter */}
          <GlowCard className="lg:col-span-2 p-6">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
              <Mic2 className="h-[18px] w-[18px] text-sky-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Teleprompter Mode</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-white/35">
              AI narration, TTS playback, presenter mic-sync, smooth auto-scroll, and fullscreen delivery controls.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'AI + TTS', icon: 'AI' },
                { label: 'Mic sync', icon: 'MIC' },
                { label: 'Fullscreen', icon: 'FS' },
              ].map(({ label, icon }) => (
                <div key={label} className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-white/60 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <span className="text-[11px] font-bold tracking-wide text-slate-600 dark:text-white/60">{icon}</span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-white/30">{label}</span>
                </div>
              ))}
            </div>
          </GlowCard>

        </div>
      </div>
    </section>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   HOW IT WORKS â€” compact horizontal strip
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STEPS = [
  { n: '01', icon: Upload,    title: 'Upload',  desc: 'Drop a PDF, DOCX, PPTX or paste a URL.' },
  { n: '02', icon: Brain,     title: 'Analyse', desc: 'AI runs grammar, tone, and plagiarism checks.' },
  { n: '03', icon: FileText,  title: 'Refine',  desc: 'Apply suggestions directly in the editor.' },
  { n: '04', icon: Download,  title: 'Export',  desc: 'Export to PDF, DOCX, or PowerPoint.' },
];

function StepsStrip() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.02] backdrop-blur-sm overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 dark:divide-white/[0.06] sm:grid-cols-4 sm:divide-y-0">
          {STEPS.map(({ n, icon: Icon, title, desc }) => (
            <div key={n} className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-black tabular-nums text-indigo-400 dark:text-indigo-500">{n}</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                  <Icon className="h-3.5 w-3.5 text-indigo-500" />
                </div>
                <span className="text-[13px] font-semibold text-slate-900 dark:text-white">{title}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-400 dark:text-white/25">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   PRICING
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface PricingTier {
  icon: React.ElementType;
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlight: boolean;
  badge?: string;
}

const PRICING: PricingTier[] = [
  {
    icon: GraduationCap,
    name: 'Free',
    price: '₹0',
    period: '/mo',
    description: 'For individuals exploring AI tools.',
    features: ['5 AI analyses / month', 'Basic grammar check', 'Manual teleprompter', 'PDF export'],
    cta: 'Start free',
    href: '/register',
    highlight: false,
  },
  {
    icon: Zap,
    name: 'Pro',
    price: '₹499',
    period: '/mo',
    description: 'Full AI power for daily use.',
    features: ['50 AI analyses / month', 'Advanced grammar & tone', 'Plagiarism detection', 'PDF, DOCX & PPTX export', 'AI + TTS teleprompter', 'Priority support'],
    cta: 'Go premium',
    href: '/pricing',
    highlight: true,
    badge: 'Most popular',
  },
  {
    icon: Building2,
    name: 'Custom',
    price: 'Custom',
    description: 'Tailored plan for institutes and teams.',
    features: ['Custom usage limits', 'All Pro features', 'Team onboarding', 'Priority onboarding support', 'Flexible billing'],
    cta: 'Contact sales',
    href: '/pricing',
    highlight: false,
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="relative px-5 pb-14 sm:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Label row */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Pricing</span>
          </div>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/[0.06]" />
          <span className="text-sm font-semibold text-slate-500 dark:text-white/30">Simple, transparent</span>
        </div>

        <div className="grid items-stretch gap-3 sm:grid-cols-3">
          {PRICING.map(({ icon: Icon, name, price, period, description, features, cta, href, highlight, badge }) => (
            <div
              key={name}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border p-5',
                highlight
                  ? 'border-indigo-400/50 bg-white shadow-lg shadow-indigo-500/10 dark:border-indigo-500/40 dark:bg-[#0d0d1a]'
                  : 'border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0e0e16]',
              )}
            >
              {/* Beam animation on highlighted */}
              {highlight && <BorderBeam duration={8} colorFrom="#6366f1" colorTo="#a855f7" />}

              {badge && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                  <span className="rounded-b-full bg-indigo-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {badge}
                  </span>
                </div>
              )}

              <div className={cn(
                'mb-3 mt-3 inline-flex h-8 w-8 items-center justify-center rounded-xl',
                highlight ? 'bg-indigo-600 shadow-md shadow-indigo-500/30' : 'bg-slate-100 dark:bg-white/[0.06]',
              )}>
                <Icon className={cn('h-4 w-4', highlight ? 'text-white' : 'text-slate-500 dark:text-white/40')} />
              </div>

              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/25">{name}</p>
              <div className="mt-1 flex items-end gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{price}</span>
                {period && <span className="mb-0.5 text-xs text-slate-400 dark:text-white/25">{period}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/30">{description}</p>

              <div className={cn('my-4 h-px', highlight ? 'bg-indigo-100 dark:bg-indigo-500/15' : 'bg-slate-100 dark:bg-white/[0.05]')} />

              <ul className="flex flex-col gap-2 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', highlight ? 'text-indigo-500' : 'text-emerald-500')} />
                    <span className="text-xs text-slate-600 dark:text-white/45">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={href}
                className={cn(
                  'mt-5 block rounded-xl px-4 py-2 text-center text-xs font-semibold transition-all hover:-translate-y-0.5 active:scale-[0.97]',
                  highlight
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 hover:bg-indigo-500'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/55 dark:hover:bg-white/[0.05]',
                )}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-white/20">
          All plans include SSL, GDPR compliance and no-commitment cancellation.
        </p>
      </div>
    </section>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CTA BANNER
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function CtaSection() {
  return (
    <div className="mx-auto max-w-4xl px-5 pb-14 sm:px-8">
      <MeteorCard meteors={18} className="overflow-hidden">
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:flex-row sm:text-left sm:gap-8 sm:px-10 sm:py-8">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Ready to write smarter?
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/40">
              Join thousands of professionals who use Ultimoversio to produce polished, impactful documents.
            </p>
          </div>
          <Link
            href="/register"
            className="group flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:bg-indigo-500 hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Create free account
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </MeteorCard>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   PAGE ROOT
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <StepsStrip />
      <CtaSection />
      <Footer />
    </div>
  );
}


