import { useState, useCallback, useEffect } from 'react';

const PERM_KEY = 'openclaw-notification-enabled';

export function useNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(PERM_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setEnabled(true);
      localStorage.setItem(PERM_KEY, 'true');
    }
  }, []);

  const toggleEnabled = useCallback(() => {
    if (permission !== 'granted') {
      requestPermission();
      return;
    }
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem(PERM_KEY, String(next));
      return next;
    });
  }, [permission, requestPermission]);

  const notify = useCallback((title: string, body: string) => {
    if (!enabled || permission !== 'granted') return;
    if (!document.hidden) return;

    const notification = new Notification(title, {
      body: body.slice(0, 200),
      icon: '/favicon.svg',
      tag: 'openclaw-task',
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    setTimeout(() => notification.close(), 8000);
  }, [enabled, permission]);

  return {
    supported: typeof Notification !== 'undefined',
    permission,
    enabled,
    toggleEnabled,
    notify,
  };
}
