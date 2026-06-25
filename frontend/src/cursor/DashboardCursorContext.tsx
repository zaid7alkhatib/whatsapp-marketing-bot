/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type DashboardCursorId =
  | "default"
  | "automation-hub"
  | "chat-growth"
  | "organic-bot"
  | "broadcast-bubble"
  | "premium-bot";

export interface DashboardCursorOption {
  id: DashboardCursorId;
  labelKey: string;
}

interface DashboardCursorContextValue {
  cursorId: DashboardCursorId;
  cursorOptions: DashboardCursorOption[];
  setCursorId: (cursorId: DashboardCursorId) => void;
}

const CURSOR_STORAGE_KEY = "whatsappMarketingDashboardCursor";
const DEFAULT_CURSOR_ID: DashboardCursorId = "default";

export const DASHBOARD_CURSOR_OPTIONS: DashboardCursorOption[] = [
  { id: "default", labelKey: "cursor.default" },
  { id: "automation-hub", labelKey: "cursor.automationHub" },
  { id: "chat-growth", labelKey: "cursor.chatGrowth" },
  { id: "organic-bot", labelKey: "cursor.organicBot" },
  { id: "broadcast-bubble", labelKey: "cursor.broadcastBubble" },
  { id: "premium-bot", labelKey: "cursor.premiumBot" },
];

const DashboardCursorContext = createContext<DashboardCursorContextValue | undefined>(undefined);

function isDashboardCursorId(value: string | null): value is DashboardCursorId {
  return DASHBOARD_CURSOR_OPTIONS.some((option) => option.id === value);
}

function getInitialCursorId(): DashboardCursorId {
  if (typeof window === "undefined") {
    return DEFAULT_CURSOR_ID;
  }

  const storedCursorId = window.localStorage.getItem(CURSOR_STORAGE_KEY);
  return isDashboardCursorId(storedCursorId) ? storedCursorId : DEFAULT_CURSOR_ID;
}

export function DashboardCursorProvider({ children }: { children: ReactNode }) {
  const [cursorId, setCursorIdState] = useState<DashboardCursorId>(getInitialCursorId);

  const setCursorId = useCallback((nextCursorId: DashboardCursorId) => {
    setCursorIdState(nextCursorId);
    window.localStorage.setItem(CURSOR_STORAGE_KEY, nextCursorId);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.dashboardCursor = cursorId;
  }, [cursorId]);

  const value = useMemo<DashboardCursorContextValue>(
    () => ({
      cursorId,
      cursorOptions: DASHBOARD_CURSOR_OPTIONS,
      setCursorId,
    }),
    [cursorId, setCursorId]
  );

  return (
    <DashboardCursorContext.Provider value={value}>
      {children}
    </DashboardCursorContext.Provider>
  );
}

export function useDashboardCursor(): DashboardCursorContextValue {
  const context = useContext(DashboardCursorContext);

  if (!context) {
    throw new Error("useDashboardCursor must be used inside DashboardCursorProvider.");
  }

  return context;
}
