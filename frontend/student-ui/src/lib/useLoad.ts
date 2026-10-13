import { useCallback, useEffect, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Loads real API data (no mock fallback); `reload` refetches without flashing the skeleton. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [LoadState<T>, () => void] {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ status: 'ready', data }),
      (e: unknown) => live && setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong' }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return [state, reload];
}
