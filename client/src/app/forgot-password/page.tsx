'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      await authApi.forgotPassword(email.trim());
      setMessage('If that email exists, a reset link has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#111320]">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
          Enter your account email and we will send a reset link valid for 15 minutes.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-300">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p>}

        <p className="mt-5 text-sm text-slate-500 dark:text-white/50">
          Remembered your password?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
