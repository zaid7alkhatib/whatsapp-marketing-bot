import type { DashboardRole } from "./auth.types";

const USER_ALLOWED_PATHS = [
  "/dashboard",
  "/gemini",
  "/flow-steps",
  "/flow-messages",
  "/baileys",
  "/service-requests",
];

export function canAccessPath(role: DashboardRole, pathname: string): boolean {
  if (role === "admin") {
    return true;
  }

  if (USER_ALLOWED_PATHS.includes(pathname)) {
    return true;
  }

  return pathname.startsWith("/service-requests/");
}
