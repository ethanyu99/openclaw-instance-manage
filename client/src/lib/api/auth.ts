import { getAuthToken } from '../user';
import type { AuthUser } from '../user';
import { apiFetch } from './client';

export async function loginWithGoogle(credential: string, clientUserId: string, tokenType?: 'id_token' | 'access_token'): Promise<{ token: string; user: AuthUser }> {
  return apiFetch('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential, clientUserId, tokenType: tokenType || 'id_token' }),
  });
}

export async function fetchCurrentUser(): Promise<{ user: AuthUser }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  return apiFetch('/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
}
