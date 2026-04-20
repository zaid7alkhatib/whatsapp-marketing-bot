import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";
import {
  AUTH_EXPIRED_EVENT,
  clearStoredAuthToken,
  getStoredAuthToken,
  storeAuthToken,
} from "./authStorage";
import type { AuthLoginResult, AuthMeResult, AuthUser } from "./auth.types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return apiMessage ?? error.message ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = useCallback(() => {
    clearStoredAuthToken();
    setUser(null);
    setIsLoading(false);
  }, []);

  const bootstrapAuth = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<ApiSuccessResponse<AuthMeResult>>("/api/v1/auth/me");
      const nextUser = response.data.data?.user;

      if (!response.data.success || !nextUser) {
        clearAuthState();
        return;
      }

      setUser(nextUser);
    } catch {
      clearAuthState();
      return;
    }

    setIsLoading(false);
  }, [clearAuthState]);

  useEffect(() => {
    void bootstrapAuth();

    const handleAuthExpired = () => {
      clearAuthState();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [bootstrapAuth, clearAuthState]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.post<ApiSuccessResponse<AuthLoginResult>>("/api/v1/auth/login", {
      username,
      password,
    });

    const loginResult = response.data.data;
    if (!response.data.success || !loginResult?.token || !loginResult.user) {
      throw new Error(response.data.message ?? "Login failed.");
    }

    storeAuthToken(loginResult.token);
    setUser(loginResult.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredAuthToken()) {
        await api.post<ApiSuccessResponse>("/api/v1/auth/logout");
      }
    } catch {
      // Local sign-out still wins if the request fails.
    } finally {
      clearAuthState();
    }
  }, [clearAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login: async (username: string, password: string) => {
        try {
          await login(username, password);
        } catch (error) {
          throw new Error(getErrorMessage(error, "Login failed."));
        }
      },
      logout,
    }),
    [isLoading, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
