import { createContext, useContext, useEffect, useState } from 'react';
import { api, loadToken, setToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        if (token) {
          const { user } = await api.me();
          setUser(user);
        }
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { token, user } = await api.login({ email, password });
    await setToken(token);
    setUser(user);
  };

  const register = async (username, email, password) => {
    const { token, user } = await api.register({ username, email, password });
    await setToken(token);
    setUser(user);
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  const refresh = async () => {
    const { user } = await api.me();
    setUser(user);
    return user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
