'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type CreditBalance = { totalBalance: number; packageBalance: number; purchasedBalance: number; bonusBalance: number; expiringAmount: number; expiresAt: string | null; loading: boolean };
type CreditContextValue = CreditBalance & { refreshCredits: () => Promise<void>; updateCredits: (remainingCredits?: number) => void; notifyCreditsChanged: (remainingCredits?: number) => void; };
const CreditBalanceContext = createContext<CreditContextValue | null>(null);
const empty: CreditBalance = { totalBalance: 0, packageBalance: 0, purchasedBalance: 0, bonusBalance: 0, expiringAmount: 0, expiresAt: null, loading: true };

export function CreditBalanceProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState<CreditBalance>(empty);
  const refreshCredits = useCallback(async () => {
    try {
      const response = await fetch('/api/billing/credits', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.credits) setCredits({ ...empty, ...data.credits, loading: false });
    } catch { setCredits((current) => ({ ...current, loading: false })); }
  }, []);
  const notifyCreditsChanged = useCallback((remainingCredits?: number) => {
    window.dispatchEvent(new CustomEvent('qikuku:credits-updated', { detail: { remainingCredits } }));
  }, []);
  const updateCredits = useCallback((remainingCredits?: number) => {
    if (typeof remainingCredits === 'number') setCredits((current) => ({ ...current, totalBalance: remainingCredits, loading: false }));
    notifyCreditsChanged(remainingCredits);
    void refreshCredits();
  }, [notifyCreditsChanged, refreshCredits]);
  useEffect(() => {
    void refreshCredits();
    const onFocus = () => void refreshCredits();
    const onUpdate = (event: Event) => { const value = (event as CustomEvent).detail?.remainingCredits; if (typeof value === 'number') setCredits((current) => ({ ...current, totalBalance: value, loading: false })); void refreshCredits(); };
    window.addEventListener('focus', onFocus); window.addEventListener('qikuku:credits-updated', onUpdate);
    const timer = window.setInterval(() => void refreshCredits(), 30_000);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('qikuku:credits-updated', onUpdate); window.clearInterval(timer); };
  }, [refreshCredits]);
  const value = useMemo(() => ({ ...credits, refreshCredits, updateCredits, notifyCreditsChanged }), [credits, refreshCredits, updateCredits, notifyCreditsChanged]);
  return <CreditBalanceContext.Provider value={value}>{children}</CreditBalanceContext.Provider>;
}
export function useCreditBalance() { const context = useContext(CreditBalanceContext); if (!context) throw new Error('useCreditBalance 必须在 CreditBalanceProvider 内使用'); return context; }
