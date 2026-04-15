'use client';

import Link from 'next/link';
import { BookOpen, Github, Twitter, Mail } from 'lucide-react';
import BugReportFab from '@/components/BugReportFab';

const LINKS = {
  Product: [
    { label: 'Dashboard',   href: '/dashboard' },
    { label: 'Upload',      href: '/upload' },
    { label: 'Teleprompter', href: '#' },
    { label: 'Export',      href: '#' },
  ],
  Features: [
    { label: 'AI Analysis',     href: '#' },
    { label: 'Grammar Check',   href: '#' },
    { label: 'Plagiarism Scan', href: '#' },
    { label: 'Tone Detection',  href: '#' },
  ],
  Account: [
    { label: 'Register', href: '/register' },
    { label: 'Login',    href: '/login' },
  ],
};

const SOCIALS = [
  { icon: Github,  href: '#', label: 'GitHub'  },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Mail,    href: '#', label: 'Email'   },
];

export function Footer() {
  return (
    <footer className="relative border-t border-slate-200/80 bg-white dark:border-white/[0.06] dark:bg-[#08080f]">
      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,102,241,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.6) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Top glow (dark only) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent dark:via-indigo-500/60"
      />

      <div className="relative mx-auto max-w-5xl px-4 pt-12 pb-8 sm:px-6">
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-2">
            <Link href="/dashboard" className="inline-flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/30 group-hover:bg-indigo-500 transition-colors">
                <BookOpen className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Ultimoversio
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-white/30">
              AI-powered document intelligence, grammar analysis, and presentation tools — all in one workspace.
            </p>
            {/* Socials */}
            <div className="mt-5 flex items-center gap-1">
              {SOCIALS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/25 dark:hover:bg-white/[0.06] dark:hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([group, items]) => (
            <div key={group}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/25">
                {group}
              </p>
              <ul className="space-y-2">
                {items.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm text-slate-500 transition-colors hover:text-indigo-600 dark:text-white/35 dark:hover:text-indigo-400"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mt-10 border-t border-slate-200 dark:border-white/[0.05]" />

        {/* Bottom bar */}
        <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[11px] text-slate-400 dark:text-white/20">
            © {new Date().getFullYear()} Ultimoversio. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <BugReportFab embedded />
            {['Privacy Policy', 'Terms of Service'].map((t) => (
              <a
                key={t}
                href="#"
                className="text-[11px] text-slate-400 transition-colors hover:text-slate-600 dark:text-white/20 dark:hover:text-white/40"
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
