import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface ChannelAccountRecord {
  _id: string;
  code?: string;
  displayName?: string;
  phoneNumber?: string;
}

interface BaileysStatusRecord {
  channelAccountId: string;
  initialized?: boolean;
  connected?: boolean;
  status?: string;
  qrAvailable?: boolean;
  phoneNumber?: string | null;
  lastConnectionUpdate?: string | null;
}

interface BaileysQrRecord {
  channelAccountId: string;
  qr: string | null;
}

const AUTO_REFRESH_INTERVAL_MS = 3000;
const START_REQUEST_TIMEOUT_MS = 45000;

function createNoCacheRequestConfig() {
  return {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    params: {
      t: Date.now(),
    },
  };
}

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

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

function formatBoolean(value?: boolean): string {
  if (value === undefined) {
    return "-";
  }

  return value ? "Yes" : "No";
}

function BaileysPage() {
  const { user } = useAuth();
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [selectedChannelAccountId, setSelectedChannelAccountId] = useState("");
  const [status, setStatus] = useState<BaileysStatusRecord | null>(null);
  const [qrData, setQrData] = useState<BaileysQrRecord | null>(null);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  const selectedChannelAccount = useMemo(
    () => channelAccounts.find((channelAccount) => channelAccount._id === selectedChannelAccountId) ?? null,
    [channelAccounts, selectedChannelAccountId]
  );

  const loadChannelAccounts = useCallback(async () => {
    setIsLoadingRefs(true);
    setRefsError(null);

    try {
      const response = await api.get<ApiSuccessResponse<ChannelAccountRecord[]>>(
        "/api/v1/channel-accounts",
        createNoCacheRequestConfig()
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];

      setChannelAccounts(records);
      setSelectedChannelAccountId((previous) => {
        if (previous && records.some((record) => record._id === previous)) {
          return previous;
        }
        return records[0]?._id ?? "";
      });
    } catch (error) {
      setRefsError(getErrorMessage(error, "Failed to load channel accounts."));
      setChannelAccounts([]);
      setSelectedChannelAccountId("");
    } finally {
      setIsLoadingRefs(false);
    }
  }, []);

  const fetchStatus = useCallback(
    async (channelAccountId: string, silent = false): Promise<BaileysStatusRecord | null> => {
      if (!channelAccountId) {
        return null;
      }

      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const response = await api.get<ApiSuccessResponse<BaileysStatusRecord>>(
          `/api/v1/baileys/status/${channelAccountId}`,
          createNoCacheRequestConfig()
        );
        const nextStatus = response.data.data ?? null;
        setStatus(nextStatus);
        return nextStatus;
      } catch (error) {
        if (!silent) {
          setPageError(getErrorMessage(error, "Failed to load Baileys status."));
        }
        setStatus(null);
        return null;
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  const fetchQr = useCallback(
    async (channelAccountId: string, silent = false): Promise<BaileysQrRecord | null> => {
      if (!channelAccountId) {
        return null;
      }

      if (!silent) {
        setIsFetchingQr(true);
      }

      try {
        const response = await api.get<ApiSuccessResponse<BaileysQrRecord>>(
          `/api/v1/baileys/qr/${channelAccountId}`,
          createNoCacheRequestConfig()
        );
        const nextQrData = response.data.data ?? { channelAccountId, qr: null };
        setQrData(nextQrData);

        if (!silent && nextQrData.qr) {
          setPageSuccess("Fetched the current pairing QR.");
        }

        return nextQrData;
      } catch (error) {
        if (!silent) {
          setPageError(getErrorMessage(error, "Failed to fetch Baileys QR."));
        }
        setQrData({ channelAccountId, qr: null });
        return null;
      } finally {
        if (!silent) {
          setIsFetchingQr(false);
        }
      }
    },
    []
  );

  const refreshConnectionData = useCallback(
    async (channelAccountId: string, silent = false) => {
      if (!channelAccountId) {
        return;
      }

      if (!silent) {
        setPageError(null);
        setPageSuccess(null);
        setIsRefreshing(true);
      } else {
        setIsAutoRefreshing(true);
      }

      try {
        const [statusResponse, qrResponse] = await Promise.all([
          api.get<ApiSuccessResponse<BaileysStatusRecord>>(
            `/api/v1/baileys/status/${channelAccountId}`,
            createNoCacheRequestConfig()
          ),
          api.get<ApiSuccessResponse<BaileysQrRecord>>(
            `/api/v1/baileys/qr/${channelAccountId}`,
            createNoCacheRequestConfig()
          ),
        ]);

        setStatus(statusResponse.data.data ?? null);
        setQrData(qrResponse.data.data ?? { channelAccountId, qr: null });
      } catch (error) {
        if (!silent) {
          setPageError(getErrorMessage(error, "Failed to refresh Baileys connection data."));
        }
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        } else {
          setIsAutoRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadChannelAccounts();
  }, [loadChannelAccounts]);

  useEffect(() => {
    if (!selectedChannelAccountId) {
      setStatus(null);
      setQrData(null);
      return;
    }

    void refreshConnectionData(selectedChannelAccountId);
  }, [refreshConnectionData, selectedChannelAccountId]);

  useEffect(() => {
    if (!selectedChannelAccountId) {
      return;
    }

    const shouldAutoRefresh =
      Boolean(qrData?.qr) ||
      Boolean(status?.qrAvailable) ||
      (Boolean(status?.initialized) && !status?.connected);

    if (!shouldAutoRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshConnectionData(selectedChannelAccountId, true);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    qrData?.qr,
    refreshConnectionData,
    selectedChannelAccountId,
    status?.connected,
    status?.initialized,
    status?.qrAvailable,
  ]);

  const handleStart = async () => {
    if (!selectedChannelAccountId) {
      setPageError("Select a channel account first.");
      return;
    }

    setPageError(null);
    setPageSuccess(null);
    setIsStarting(true);

    try {
      const response = await api.post<ApiSuccessResponse<BaileysStatusRecord>>(
        `/api/v1/baileys/start/${selectedChannelAccountId}`,
        undefined,
        { timeout: START_REQUEST_TIMEOUT_MS }
      );

      setStatus(response.data.data ?? null);
      setPageSuccess("Baileys start request sent. The page will auto-refresh while pairing is active.");
      await refreshConnectionData(selectedChannelAccountId, true);
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
        setStatus((previous) => ({
          channelAccountId: selectedChannelAccountId,
          initialized: previous?.initialized ?? true,
          connected: false,
          status: "connecting",
          qrAvailable: previous?.qrAvailable ?? false,
          lastConnectionUpdate: new Date().toISOString(),
          phoneNumber: previous?.phoneNumber ?? null,
        }));
        setPageSuccess(
          "The start request exceeded the browser timeout, but Baileys initialization may still be running. The page will keep polling status and QR."
        );
        void refreshConnectionData(selectedChannelAccountId, true);
        return;
      }

      setPageError(getErrorMessage(error, "Failed to start Baileys connection."));
    } finally {
      setIsStarting(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!selectedChannelAccountId) {
      setPageError("Select a channel account first.");
      return;
    }

    await refreshConnectionData(selectedChannelAccountId);
  };

  const handleFetchQr = async () => {
    if (!selectedChannelAccountId) {
      setPageError("Select a channel account first.");
      return;
    }

    setPageError(null);
    setPageSuccess(null);
    await fetchQr(selectedChannelAccountId);
  };

  const handleLogout = async () => {
    if (!selectedChannelAccountId) {
      setPageError("Select a channel account first.");
      return;
    }

    setPageError(null);
    setPageSuccess(null);
    setIsLoggingOut(true);

    try {
      await api.post<ApiSuccessResponse>(`/api/v1/baileys/logout/${selectedChannelAccountId}`);
      setPageSuccess("Baileys connection logged out successfully.");
      setQrData({ channelAccountId: selectedChannelAccountId, qr: null });
      await fetchStatus(selectedChannelAccountId, true);
      await fetchQr(selectedChannelAccountId, true);
    } catch (error) {
      setPageError(getErrorMessage(error, "Failed to log out Baileys connection."));
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isBusy = isLoadingRefs || isStarting || isRefreshing || isLoggingOut || isFetchingQr;
  const canShowQr = Boolean(qrData?.qr);
  const isConnecting = Boolean(status?.initialized && !status?.connected);
  const connectionStatusLabel = status?.status || (status?.connected ? "connected" : "idle");

  return (
    <PageSection
      title="WhatsApp Pairing"
      description="Start a Baileys session, monitor connection state, and scan the current QR from the admin dashboard."
      onRefresh={() => void loadChannelAccounts()}
      actions={
        selectedChannelAccountId ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshConnectionData(selectedChannelAccountId)}
            disabled={isBusy}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        ) : null
      }
    >
      {isLoadingRefs ? <LoadingState text="Loading channel accounts..." /> : null}

      {!isLoadingRefs && refsError ? <InlineAlert tone="error" message={refsError} /> : null}

      {!isLoadingRefs && !refsError && channelAccounts.length === 0 ? (
        <InlineAlert
          tone="empty"
          message="No channel accounts were found. Create a WhatsApp-compatible channel account before pairing."
        />
      ) : null}

      {!isLoadingRefs && !refsError && channelAccounts.length > 0 ? (
        <>
          <form className="runtime-form" onSubmit={(event) => event.preventDefault()}>
            <div className="form-header">
              <h3 className="form-title">Connection Controls</h3>
              <p className="form-subtitle">
                {user?.role === "user"
                  ? "This workspace is locked to one approved WhatsApp channel account."
                  : "Select the target channel account, then start or refresh the linked-device session."}
              </p>
            </div>

            <div className="form-grid">
              {user?.role === "user" ? (
                <label className="form-field form-field-full">
                  <span>Scoped WhatsApp Account</span>
                  <div className="input-control readonly-control">
                    {selectedChannelAccount
                      ? `${selectedChannelAccount.displayName || selectedChannelAccount.code}${
                          selectedChannelAccount.phoneNumber ? ` • ${selectedChannelAccount.phoneNumber}` : ""
                        }`
                      : "No scoped channel account is available."}
                  </div>
                  <small className="form-help">
                    The client workspace can only pair and monitor this one approved account.
                  </small>
                </label>
              ) : (
                <label className="form-field form-field-full">
                  <span>Channel Account</span>
                  <select
                    className="input-control"
                    value={selectedChannelAccountId}
                    onChange={(event) => {
                      setPageError(null);
                      setPageSuccess(null);
                      setSelectedChannelAccountId(event.target.value);
                    }}
                  >
                    <option value="">Select channel account</option>
                    {channelAccounts.map((channelAccount) => (
                      <option key={channelAccount._id} value={channelAccount._id}>
                        {channelAccount.code || channelAccount.displayName || channelAccount._id}
                      </option>
                    ))}
                  </select>
                  <small className="form-help">
                    {selectedChannelAccount
                      ? `Selected: ${selectedChannelAccount.displayName || selectedChannelAccount.code || selectedChannelAccount._id}${
                          selectedChannelAccount.phoneNumber ? ` • ${selectedChannelAccount.phoneNumber}` : ""
                        }`
                      : "Choose the channel account that should own the WhatsApp device session."}
                  </small>
                </label>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleStart}
                disabled={!selectedChannelAccountId || isBusy || Boolean(status?.connected)}
              >
                {isStarting ? "Starting..." : status?.connected ? "Connected" : "Start"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleRefreshStatus}
                disabled={!selectedChannelAccountId || isBusy}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Status"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleFetchQr}
                disabled={!selectedChannelAccountId || isBusy}
              >
                {isFetchingQr ? "Fetching QR..." : "Fetch QR"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleLogout}
                disabled={!selectedChannelAccountId || isBusy || !status?.initialized}
              >
                {isLoggingOut ? "Logging Out..." : "Logout"}
              </button>
            </div>

            <div className="baileys-meta-row">
              <span className="muted-text">
                Live state: <strong>{connectionStatusLabel}</strong>
              </span>
              {isConnecting || isAutoRefreshing ? (
                <span className="muted-text">
                  Auto-refreshing every {AUTO_REFRESH_INTERVAL_MS / 1000}s while pairing is active.
                </span>
              ) : null}
            </div>
          </form>

          {pageError ? <InlineAlert tone="error" message={pageError} /> : null}

          {status?.connected ? (
            <InlineAlert
              tone="success"
              message="WhatsApp is connected. Incoming text messages can now pass through the existing runtime flow."
            />
          ) : null}

          {!status?.connected && pageSuccess ? <InlineAlert tone="info" message={pageSuccess} /> : null}

          <div className="baileys-layout">
            <div className="baileys-status-panel">
              <div className="detail-wrap">
                <div className="detail-grid baileys-detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">Initialized</span>
                    <span className="detail-value">{formatBoolean(status?.initialized)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Connected</span>
                    <span className="detail-value">
                      {status?.connected !== undefined ? (
                        <StatusBadge value={status.connected ? "Connected" : "Disconnected"} />
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status</span>
                    <span className="detail-value">
                      {status?.status ? <StatusBadge value={status.status} /> : "-"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">QR Available</span>
                    <span className="detail-value">{formatBoolean(status?.qrAvailable)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Phone Number</span>
                    <span className="detail-value">{status?.phoneNumber || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Last Connection Update</span>
                    <span className="detail-value">{formatDateTime(status?.lastConnectionUpdate)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="baileys-qr-panel">
              <div className="card baileys-qr-card">
                <div className="baileys-qr-header">
                  <h3 className="card-title">Pairing QR</h3>
                  <p className="card-description">
                    Scan this code from WhatsApp Linked Devices while the selected channel account is connecting.
                  </p>
                </div>

                {canShowQr ? (
                  <div className="baileys-qr-frame">
                    <QRCodeSVG value={qrData?.qr ?? ""} size={280} includeMargin level="M" />
                  </div>
                ) : (
                  <div className="state-block state-empty baileys-qr-empty">
                    <p>
                      {status?.connected
                        ? "This account is already connected. No QR is needed."
                        : "No active QR is available right now. Start the connection, then wait for the live auto-refresh cycle to pull it in."}
                    </p>
                  </div>
                )}

                {selectedChannelAccountId && user?.role !== "user" ? (
                  <p className="baileys-qr-copy cell-mono">{selectedChannelAccountId}</p>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </PageSection>
  );
}

export default BaileysPage;

