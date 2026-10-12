import { API_BASE_URL, TOKEN_KEY } from './config';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type UnauthorizedHandler = (message: string) => void;
let onUnauthorized: UnauthorizedHandler = () => {};
export const setUnauthorizedHandler = (fn: UnauthorizedHandler) => { onUnauthorized = fn; };

export const getToken = (): string | null => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } };
export const clearToken = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

/** Turns FastAPI `detail` (string or validation list) into a message. */
function detailMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => String((d as { msg?: string }).msg ?? '').replace(/^Value error, /, '')).join('; ');
  return status === 403 ? 'You do not have permission to do that.' : `Something went wrong (error ${status}).`;
}

/** The only place that calls fetch. Components use the service functions in ./services. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_BASE_URL}. Check your connection and try again.`, 0);
  }
  if (res.status === 401 && token && path !== '/auth/login') {
    onUnauthorized('Your session has ended. Please sign in again.');
    throw new ApiError('Session expired', 401);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(detailMessage(data.detail, res.status), res.status);
  }
  return (await res.json()) as T;
}
