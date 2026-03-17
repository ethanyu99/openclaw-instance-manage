import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  getAuthUser,
  getAuthToken,
  isLoggedIn as checkLoggedIn,
  setAuth,
  clearAuth,
  notifyAuthChange,
  onAuthChange,
  getUserId,
} from '@/lib/user';
import { loginWithGoogle, fetchCurrentUser } from '@/lib/api';

let cachedUser = getAuthUser();
let cachedLoggedIn = checkLoggedIn();

function handleStoreChange() {
  cachedUser = getAuthUser();
  cachedLoggedIn = checkLoggedIn();
}

// Subscribe wires up our cache refresh + the external listener
function subscribe(cb: () => void) {
  const unsub = onAuthChange(() => {
    handleStoreChange();
    cb();
  });
  return unsub;
}

function getSnapshotUser() {
  return cachedUser;
}

function getSnapshotLoggedIn() {
  return cachedLoggedIn;
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshotUser);
  const loggedIn = useSyncExternalStore(subscribe, getSnapshotLoggedIn);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(() => !!getAuthToken());

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setValidating(false);
      return;
    }

    fetchCurrentUser()
      .then(({ user: u }) => {
        setAuth(token, u);
        notifyAuthChange();
      })
      .catch(() => {
        clearAuth();
        notifyAuthChange();
      })
      .finally(() => setValidating(false));
  }, []);

  const handleGoogleLogin = useCallback(async (credential: string, tokenType?: 'id_token' | 'access_token') => {
    setLoading(true);
    try {
      const clientUserId = getUserId();
      const { token, user: u } = await loginWithGoogle(credential, clientUserId, tokenType);
      setAuth(token, u);
      notifyAuthChange();
    } catch (err) {
      console.error('Google login failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    notifyAuthChange();
  }, []);

  return {
    user,
    loading,
    validating,
    isLoggedIn: loggedIn,
    handleGoogleLogin,
    logout,
  };
}
