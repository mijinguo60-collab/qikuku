'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createInFlightRequest } from '@/lib/client/inflight-request';

export type CreditBalance = { totalBalance: number; packageBalance: number; purchasedBalance: number; bonusBalance: number; expiringAmount: number; expiresAt: string | null; loading: boolean };
/* eslint-disable no-unused-vars -- Tuple labels document the public hook API. */
type CreditContextValue = CreditBalance & { error: boolean; refreshCredits: () => Promise<void>; updateCredits: (..._args: [number?]) => void; notifyCreditsChanged: (..._args: [number?]) => void; };
/* eslint-enable no-unused-vars */
const CreditBalanceContext = createContext<CreditContextValue | null>(null);
const empty: CreditBalance = { totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0, expiringAmount: 0, expiresAt: null, loading: true };

export function CreditBalanceProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState<CreditBalance>(empty);
  const [hasError, setHasError] = useState(false);
  const requestDeduperRef = useRef(createInFlightRequest<void>());
  const refreshCredits = useCallback(async () => {
    return requestDeduperRef.current.run(async () => {
      try {
        const response = await fetch('/api/billing/credits', { cache: 'no-store', credentials: 'same-origin' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.credits) throw new Error('credit_fetch_failed');
        setCredits({ ...empty, ...data.credits, loading: false });
        setHasError(false);
      } catch {
        // Preserve the last confirmed balance during a transient outage.
        setCredits((current) => ({ ...current, loading: false }));
        setHasError(true);
      }
    });
  }, []);
  const notifyCreditsChanged = useCallback((remainingCredits?: number) => {
    window.dispatchEvent(new CustomEvent('qikuku:credits-updated', { detail: { remainingCredits } }));
  }, []);
  const updateCredits = useCallback((remainingCredits?: number) => {
    if (typeof remainingCredits === 'number') setCredits((current) => ({ ...current, totalBalance: remainingCredits, loading: false }));
    // Server-side billing remains authoritative. A successful charge or grant
    // is an explicit refresh event; concurrent refreshes share one request.
    void refreshCredits();
  }, [refreshCredits]);
  useEffect(() => {
    void refreshCredits();
    const onUpdate = (event: Event) => {
      const value = (event as CustomEvent).detail?.remainingCredits;
      if (typeof value === 'number') setCredits((current) => ({ ...current, totalBalance: value, loading: false }));
      void refreshCredits();
    };
    window.addEventListener('qikuku:credits-updated', onUpdate);
    return () => window.removeEventListener('qikuku:credits-updated', onUpdate);
  }, [refreshCredits]);
  const value = useMemo(() => ({ ...credits, error: hasError, refreshCredits, updateCredits, notifyCreditsChanged }), [credits, hasError, refreshCredits, updateCredits, notifyCreditsChanged]);
  return <CreditBalanceContext.Provider value={value}>{children}</CreditBalanceContext.Provider>;
}
export function useCreditBalance() { const context = useContext(CreditBalanceContext); if (!context) throw new Error('useCreditBalance 必须在 CreditBalanceProvider 内使用'); return context; }
