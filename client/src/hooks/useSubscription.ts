'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { paymentApi } from '@/lib/api';
import type { SubscriptionInfo } from '@/types';

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!user) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        setIsLoading(true);
        const data = await paymentApi.getSubscription();
        if (mounted) setSubscription(data);
      } catch {
        if (mounted) setSubscription(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  const isPremium = useMemo(() => {
    if (!subscription) return false;
    return subscription.plan === 'pro' && subscription.isActive;
  }, [subscription]);

  const limits = subscription?.limits;
  const trials = subscription?.trials;
  const canUseNarrationTrial = Boolean(trials?.ttsNarration?.available);
  const canUseExportTrial = Boolean(trials?.export?.available);

  const uploadLimit = limits?.uploadsPerMonth ?? 5;
  const aiLimit = limits?.aiUsagePerMonth ?? 5;
  const uploadUsed = subscription?.uploadUsageThisMonth ?? 0;
  const aiUsed = subscription?.aiUsageThisMonth ?? 0;
  const uploadRemaining = uploadLimit === -1 ? Infinity : Math.max(0, uploadLimit - uploadUsed);
  const aiRemaining = aiLimit === -1 ? Infinity : Math.max(0, aiLimit - aiUsed);
  const hasUploadOverageTrial = Boolean(trials?.uploadOverage?.available);
  const hasAiOverageTrial = Boolean(trials?.aiOverage?.available);
  const uploadLimitReached = uploadLimit !== -1 && uploadUsed >= uploadLimit;
  const aiLimitReached = aiLimit !== -1 && aiUsed >= aiLimit;
  const uploadBlocked = uploadLimitReached && !hasUploadOverageTrial;
  const aiBlocked = aiLimitReached && !hasAiOverageTrial;

  return {
    subscription,
    isLoading,
    isPremium,
    canUseTeleprompterAI: Boolean((isPremium && limits?.teleprompterAI) || canUseNarrationTrial),
    canUseExportPPT: Boolean((isPremium && limits?.exportPPT) || canUseExportTrial),
    canUseTTSNarration: Boolean((isPremium && limits?.ttsNarration) || canUseNarrationTrial),
    canUseExportTrial,
    canUseNarrationTrial,
    canUseGrammarFix: Boolean(isPremium && limits?.grammarFix),
    canUseHumanizeText: Boolean(isPremium && limits?.humanizeText),
    uploadLimit,
    aiLimit,
    uploadUsed,
    aiUsed,
    uploadRemaining,
    aiRemaining,
    hasUploadOverageTrial,
    hasAiOverageTrial,
    uploadLimitReached,
    aiLimitReached,
    uploadBlocked,
    aiBlocked,
  };
}
