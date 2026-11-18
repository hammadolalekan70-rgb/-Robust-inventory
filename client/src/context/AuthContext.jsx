import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onUnauthorized = () => setUser(null);
    window.addEventListener('rwi:unauthorized', onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener('rwi:unauthorized', onUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    if (data.requiresCode) return data;
    setUser(data.user);
    return data.user;
  }, []);

  const verifyLogin = useCallback(async (code) => {
    const data = await api.post('/auth/login/verify', { code });
    setUser(data.user);
    return data.user;
  }, []);

  const resendLoginCode = useCallback(async () => {
    return api.post('/auth/login/resend');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isBoss: user?.role === 'boss',
      login,
      verifyLogin,
      resendLoginCode,
      logout,
      refresh
    }),
    [user, loading, login, verifyLogin, resendLoginCode, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
