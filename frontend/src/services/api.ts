import axios from "axios";
import {
  clearStoredAuthToken,
  emitAuthExpiredEvent,
  getStoredAuthToken,
} from "../auth/authStorage";

export const api = axios.create({
  baseURL: "http://localhost:3001",
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
  (error) => {
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
