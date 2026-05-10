import axios from "axios";
import {
  clearStoredAuthToken,
  emitAuthExpiredEvent,
  getStoredAuthToken,
} from "../auth/authStorage";

const PRIMARY_API_BASE_URL = "http://localhost:5000";
const FALLBACK_API_BASE_URL = "http://127.0.0.1:5000";
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
const apiBaseUrl = configuredApiBaseUrl || PRIMARY_API_BASE_URL;

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function getNextBaseUrl(currentBaseUrl?: string): string | null {
  const normalizedCurrent = normalizeBaseUrl(currentBaseUrl);

  if (configuredApiBaseUrl) {
    return null;
  }

  if (!normalizedCurrent) {
    return FALLBACK_API_BASE_URL;
  }

  if (normalizedCurrent === PRIMARY_API_BASE_URL) {
    return FALLBACK_API_BASE_URL;
  }

  if (normalizedCurrent === FALLBACK_API_BASE_URL) {
    return PRIMARY_API_BASE_URL;
  }

  return null;
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const authToken = getStoredAuthToken();
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error)) {
      const originalRequest = error.config as
        | (typeof error.config & { _baseUrlRetried?: boolean })
        | undefined;

      if (!error.response && originalRequest && !originalRequest._baseUrlRetried) {
        const nextBaseUrl = getNextBaseUrl(
          originalRequest.baseURL ?? api.defaults.baseURL
        );
        if (nextBaseUrl) {
          originalRequest._baseUrlRetried = true;
          originalRequest.baseURL = nextBaseUrl;
          return api.request(originalRequest);
        }
      }
    }

    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = String(error.config?.url ?? "");
      const isLoginRequest = requestUrl.includes("/api/v1/auth/login");

      if (!isLoginRequest) {
        clearStoredAuthToken();
        emitAuthExpiredEvent();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
