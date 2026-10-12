import { useCallback, useEffect, useState } from 'react';
import type { Sourced } from '../api/types';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; source: 'api' | 'mock' };

/** Runs a service call once and exposes loading / error / ready plus a retry. */
export function useAsync<T>(fn: () => Promise<Sourced<T>>): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fn().then(
      (r) => live && setState({ status: 'ready', data: r.data, source: r.source }),
      (e: unknown) => live && setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong' }),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return [state, retry];
}
