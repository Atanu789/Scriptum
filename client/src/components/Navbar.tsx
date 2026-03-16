'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import { BookOpen, LayoutDashboard, Upload, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
];

function UserAvatar({ name }: { name?: string }) {
  const initial = (name ?? 'U')[0].toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white select-none"
    >
      {initial}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80">
      {/* Gradient top-line accent */}
      <div
        aria-hidden
        className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-indigo-500/70 to-transparent"
      />

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group transition-opacity hover:opacity-90">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-shadow">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Ultimoversio</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150',
                pathname === item.href
                  ? 'bg-indigo-50/80 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200'
              )}
            >
              {pathname === item.href && (
                <span className="absolute inset-x-2 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />
              )}
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User area */}
        <div className="hidden items-center gap-1.5 md:flex">
          {user && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/70 px-2.5 py-1 dark:border-slate-700/70 dark:bg-slate-900/60">
              <UserAvatar name={user.name} />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{user.name}</span>
            </div>
          )}
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-indigo-400"
            aria-label="Toggle theme"
          >
            {theme === 'dark'
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="btn-ghost p-2 md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-200/70 bg-white/95 px-4 pb-4 dark:border-slate-800/70 dark:bg-slate-950/95 md:hidden">
          <nav className="mt-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  pathname === item.href
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/70 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          {user && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <UserAvatar name={user.name} />
                <span className="text-sm text-slate-700 dark:text-slate-300">{user.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

