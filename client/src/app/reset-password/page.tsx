import { Suspense } from 'react';
import ResetPasswordClient from './reset-password-client';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordClient />
    </Suspense>
  );
}

function ResetPasswordFallback() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#111320]">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Reset password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
          Loading reset form...
        </p>
      </div>
    </main>
  );
}
