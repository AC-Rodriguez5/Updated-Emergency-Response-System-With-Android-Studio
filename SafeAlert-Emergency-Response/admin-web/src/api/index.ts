import type { Account, AuthSession, Envelope } from '@/types';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const REFRESH_KEY = 'safealert.admin.refresh';
let session: AuthSession | null = null;
let refreshPromise: Promise<AuthSession> | null = null;
let sessionEpoch = 0;
export const sessionEvents = new EventTarget();
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) { super(message); this.name = 'ApiError'; }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return `${error.message} Refresh the record before trying again.`;
    if (error.status === 403) return 'Your account cannot access this information. Contact your system administrator.';
    if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'The request could not be completed. Try again.';
}
function storage() { return typeof window !== 'undefined' ? window.sessionStorage : undefined; }
export const currentSession = () => session;
export function setSession(value: AuthSession | null) {
  session = value;
  if (value) storage()?.setItem(REFRESH_KEY, value.refreshToken); else storage()?.removeItem(REFRESH_KEY);
  sessionEvents.dispatchEvent(new Event('change'));
}
export function clearSession() { sessionEpoch++; setSession(null); }
async function transport(path: string, options: RequestInit = {}, token?: string): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 10_000);
  try {
    return await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch {
    if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    throw new ApiError(0, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', controller.signal.aborted ? 'The request timed out. Check the record before retrying a change.' : 'Unable to reach SafeAlert. Check your connection and try again.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
async function failure(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null);
  throw new ApiError(response.status, payload?.error?.code || 'REQUEST_FAILED', payload?.error?.message || `The server could not complete this request (${response.status}).`, payload?.requestId);
}
export async function refreshSession(): Promise<AuthSession> {
  if (refreshPromise) return refreshPromise;
  const epoch = sessionEpoch;
  refreshPromise = (async () => {
    const refreshToken = session?.refreshToken || storage()?.getItem(REFRESH_KEY);
    if (!refreshToken) throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in to continue.');
    const response = await transport('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    if (!response.ok) return failure(response);
    const payload: Envelope<AuthSession> = await response.json();
    if (payload.data.account.role !== 'admin' || payload.data.account.status !== 'approved') throw new ApiError(403, 'ADMIN_REQUIRED', 'An approved administrator account is required.');
    if (epoch !== sessionEpoch) throw new ApiError(401, 'SESSION_CHANGED', 'Sign in to continue.');
    setSession(payload.data); return payload.data;
  })().catch(error => { if (epoch === sessionEpoch && error instanceof ApiError && [401, 403].includes(error.status)) clearSession(); throw error; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function authorized(path: string, options: RequestInit): Promise<Response> {
  const usedToken = session?.accessToken;
  let response = await transport(path, options, usedToken);
  if (response.status === 401) {
    const refreshed = session?.accessToken && session.accessToken !== usedToken ? session : await refreshSession();
    response = await transport(path, options, refreshed.accessToken);
    if (response.status === 401) clearSession();
  }
  if (!response.ok) return failure(response);
  return response;
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<Envelope<T>> { return (await authorized(path, options)).json(); }
export const post = <T,>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function privateDocument(id: string, signal?: AbortSignal): Promise<Blob> { return (await authorized(`/upload/${encodeURIComponent(id)}`, { signal })).blob(); }
export async function login(email: string, password: string): Promise<Account> {
  const response = await transport('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'admin', rememberMe: false }) });
  if (!response.ok) return failure(response);
  const { data }: Envelope<AuthSession> = await response.json();
  if (data.account.role !== 'admin' || data.account.status !== 'approved') throw new ApiError(403, 'ADMIN_REQUIRED', 'An approved administrator account is required.');
  sessionEpoch++; setSession(data); return data.account;
}
export async function logout() {
  const previous = session;
  try { if (previous) { const response = await transport('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: previous.refreshToken }) }, previous.accessToken); if (!response.ok) await failure(response); } }
  finally { clearSession(); }
}
export async function restoreSession() {
  for (const key of ['authToken', 'refreshToken', 'user']) window.localStorage.removeItem(key);
  if (!storage()?.getItem(REFRESH_KEY)) return null;
  await refreshSession();
  const { data } = await request<Account>('/auth/me');
  if (data.role !== 'admin' || data.status !== 'approved') { clearSession(); return null; }
  return data;
}

