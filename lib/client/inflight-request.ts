/**
 * Shares one in-progress idempotent request with all concurrent callers.
 * It deliberately caches only while a request is running; completed dynamic
 * data is never retained here.
 */
export function createInFlightRequest<T>() {
  let inFlight: Promise<T> | null = null;
  return {
    run(loader: () => Promise<T>): Promise<T> {
      if (inFlight) return inFlight;
      inFlight = loader().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
