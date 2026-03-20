'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, BookOpen, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { AceLabel, AceInput, ShimmerButton } from '@/components/ui/ace-input';
import { MeteorCard } from '@/components/ui/meteor-card';

const FEATURES = [
  { title: 'AI Content Analysis', desc: 'Detect AI-generated text, grammar issues, and rewrite suggestions.' },
  { title: 'Teleprompter Mode', desc: 'Full-screen, speed-controlled presentation with keyboard shortcuts.' },
  { title: 'PowerPoint Export', desc: 'Auto-generate beautiful slide decks from your document sections.' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithGoogle } = useAuth();

  const [form, setForm]                 = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setIsLoading(true);
    try {
      await register(form.name, form.email, form.password);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      toast.error('Google sign-up did not return a valid token');
      return;
    }

    setIsLoading(true);
    try {
      await loginWithGoogle(idToken);
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-4xl gap-8 lg:gap-14">

        {/* ── Left branding ────────────────────────────────────────────── */}
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
              Everything you need<br />
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                to publish better
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Free account. No credit card required.</p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 dark:border-indigo-500/20 dark:bg-indigo-950/20"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{f.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Right form card ──────────────────────────────────────────── */}
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
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create your account</h2>
                <p className="mt-1 text-sm text-slate-500">Free — no credit card needed</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <AceLabel htmlFor="name">Full Name</AceLabel>
                  <AceInput
                    id="name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
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
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Min. 8 characters"
                      className="pr-10"
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <AceLabel htmlFor="confirm">Confirm Password</AceLabel>
                  <AceInput
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="Repeat your password"
                    value={form.confirm}
                    onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                  />
                </div>

                <ShimmerButton type="submit" disabled={isLoading} className="mt-2">
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
                    : 'Create account'
                  }
                </ShimmerButton>
              </form>

              {googleClientId && (
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
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => toast.error('Google sign-up was cancelled or failed')}
                      text="signup_with"
                      shape="pill"
                      width="280"
                    />
                  </div>
                </>
              )}

              <p className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                  Sign in
                </Link>
              </p>
            </div>
          </MeteorCard>
        </motion.div>
      </div>
    </div>
  );
}
