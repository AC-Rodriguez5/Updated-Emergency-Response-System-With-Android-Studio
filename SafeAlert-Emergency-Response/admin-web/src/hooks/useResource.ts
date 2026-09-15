import { useCallback, useEffect, useState } from 'react';
import { request, errorMessage } from '@/api';
import type { Envelope } from '@/types';
export const refreshEvent = 'safealert:refresh';
export function invalidateResources() { window.dispatchEvent(new Event(refreshEvent)); }
export function useResource<T>(path: string | null) {
  const [result, setResult] = useState<Envelope<T> | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => { window.addEventListener(refreshEvent, retry); return () => window.removeEventListener(refreshEvent, retry); }, [retry]);
  useEffect(() => { setResult(null); setError(null); }, [path]);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    request<T>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setResult(value); setError(null); setUpdatedAt(new Date()); }
    }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, version]);
  return { result, data: result?.data, loading, error, retry, updatedAt };
}
