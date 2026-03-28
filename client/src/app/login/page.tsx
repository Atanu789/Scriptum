'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, BookOpen, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { AceLabel, AceInput, ShimmerButton } from '@/components/ui/ace-input';
import { MeteorCard } from '@/components/ui/meteor-card';

const FEATURES = ['Grammar Check', 'AI Analysis', 'Teleprompter', 'PPT Export'];

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();

  const [form, setForm]                 = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(form.email, form.password);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await loginWithGoogle('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-4xl gap-8 lg:gap-14">

        {/* â”€â”€ Left branding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden flex-col justify-center gap-8 lg:flex lg:w-5/12"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Ultimoversio</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight text-slate-900 dark:text-white">
              Your AI-powered<br />
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                content studio
              </span>
            </h1>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Upload documents, run AI analysis, edit with a professional editor,
              and export as PowerPoint or narrated video.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.07 }}
                className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-950/20 dark:text-indigo-300"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {f}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* â”€â”€ Right form card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="flex-1"
        >
          <MeteorCard meteors={8} className="w-full">
            <div className="space-y-6 p-2">
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                  <BookOpen className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-semibold">Ultimoversio</span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Welcome back</h2>
                <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <AceLabel htmlFor="email">Email</AceLabel>
                  <AceInput
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>

                <div>
                  <AceLabel htmlFor="password">Password</AceLabel>
                  <div className="relative">
                    <AceInput
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      className="pr-10"
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 text-right">
                    <Link href="/forgot-password" className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                      Forgot Password?
                    </Link>
                  </div>
                </div>

                <ShimmerButton type="submit" disabled={isLoading} className="mt-2">
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing inâ€¦</>
                    : 'Sign in'
                  }
                </ShimmerButton>
              </form>

              {clerkPublishableKey && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                      <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-2 text-xs text-slate-400 dark:bg-slate-950">or continue with</span>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Continue with Google
                    </button>
                  </div>
                </>
              )}

              <p className="text-center text-sm text-slate-500">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                  Create one free
                </Link>
              </p>
            </div>
          </MeteorCard>
        </motion.div>
      </div>
    </div>
  );
}
