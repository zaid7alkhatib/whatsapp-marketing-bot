import type { DashboardRole } from "./auth.types";

const USER_ALLOWED_PATHS = [
  "/dashboard",
  "/gemini",
  "/flow-steps",
  "/flow-messages",
  "/team-users",
  "/baileys",
  "/medical-appointments",
  "/service-requests",
];

const EMPLOYEE_ALLOWED_PATHS = [
  "/dashboard",
  "/baileys",
  "/medical-appointments",
  "/service-requests",
];

export function canAccessPath(role: DashboardRole, pathname: string): boolean {
  if (role === "admin") {
    return true;
  }

  if (role === "user" && USER_ALLOWED_PATHS.includes(pathname)) {
    return true;
  }

  if (role === "employee" && EMPLOYEE_ALLOWED_PATHS.includes(pathname)) {
    return true;
  }

  return (
    (role === "user" || role === "employee") &&
    pathname.startsWith("/service-requests/")
  );
}
