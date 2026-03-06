const USER_ID_KEY = 'openclaw-user-id';
const AUTH_TOKEN_KEY = 'openclaw-auth-token';
const AUTH_USER_KEY = 'openclaw-auth-user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

export function getUserId(): string {
  // If logged in, use the authenticated user's id
  const authUser = getAuthUser();
  if (authUser) return authUser.id;

  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

export function getShortUserId(): string {
  return getUserId().slice(0, 8);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getAuthToken() && !!getAuthUser();
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  // Sync the user id so all data stays associated
  localStorage.setItem(USER_ID_KEY, user.id);
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

type AuthChangeListener = () => void;
const listeners = new Set<AuthChangeListener>();

export function onAuthChange(listener: AuthChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAuthChange(): void {
  for (const fn of listeners) fn();
}
