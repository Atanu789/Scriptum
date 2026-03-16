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

  return {
    subscription,
    isLoading,
    isPremium,
    canUseTeleprompterAI: Boolean(isPremium && limits?.teleprompterAI),
    canUseExportPPT: Boolean(isPremium && limits?.exportPPT),
    canUseTTSNarration: Boolean(isPremium && limits?.ttsNarration),
    canUseGrammarFix: Boolean(isPremium && limits?.grammarFix),
    canUseHumanizeText: Boolean(isPremium && limits?.humanizeText),
  };
}
