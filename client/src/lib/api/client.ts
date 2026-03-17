import { getUserId, getAuthToken } from '../user';
import { toast } from 'sonner';

const API_BASE = '/api';

export { API_BASE };

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': getUserId(),
    ...extra,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers = init?.headers
    ? { ...authHeaders(), ...(init.headers as Record<string, string>) }
    : authHeaders();

  if (init?.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    let errorMessage = `Request failed: ${res.statusText}`;
    let errorCode = 'UNKNOWN';
    try {
      const body = await res.json();
      errorMessage = body.error || body.message || errorMessage;
      errorCode = body.code || errorCode;
    } catch {
      // not JSON
    }
    // Auto-toast for common errors
    if (res.status === 429) {
      toast.error('请求过于频繁，请稍后重试');
    } else if (res.status >= 500) {
      toast.error('服务器错误，请稍后重试');
    }

    throw new ApiError(errorMessage, res.status, errorCode);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }

  return res.text() as unknown as T;
}
