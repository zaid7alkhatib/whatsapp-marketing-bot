import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface RequestInboxRecord {
  statusCode?: string;
  isAppointment?: boolean;
}

interface RequestInboxCounts {
  isLoading: boolean;
  errorMessage: string | null;
  generalNewCount: number;
  appointmentNewCount: number;
}

function useRequestInboxCounts(enabled = true): RequestInboxCounts {
  const [records, setRecords] = useState<RequestInboxRecord[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    if (!enabled) {
      setRecords([]);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<RequestInboxRecord[]>>(
        "/api/v1/service-requests"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load request counts.");
      }

      setRecords(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setErrorMessage(apiMessage ?? "Failed to load request counts.");
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  return useMemo(() => {
    const openRecords = records.filter((record) => (record.statusCode ?? "").toLowerCase() === "new");

    return {
      isLoading,
      errorMessage,
      generalNewCount: openRecords.filter((record) => !record.isAppointment).length,
      appointmentNewCount: openRecords.filter((record) => Boolean(record.isAppointment)).length,
    };
  }, [errorMessage, isLoading, records]);
}

export default useRequestInboxCounts;
