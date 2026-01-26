import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { ApiUser } from "@/api/types";
import { authApi } from "@/api/auth";

interface SessionContextValue {
  user: ApiUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<ApiUser>;
  loginWithGoogle: (idToken: string) => Promise<ApiUser>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { user } = await authApi.currentSession();
      setUser(user);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (identifier: string, password: string) => {
    const loggedIn = await authApi.login({ identifier, password });
    setUser(loggedIn);
    return loggedIn;
  };
  
  const loginWithGoogle = async (idToken: string) => {
    const loggedIn = await authApi.googleLogin({ id_token: idToken });
    setUser(loggedIn);
    return loggedIn;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <SessionContext.Provider value={{ user, loading, refresh, login, loginWithGoogle, logout }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
};

