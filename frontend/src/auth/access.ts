import type { DashboardRole } from "./auth.types";

const ROLE_PATHS: Record<DashboardRole, string[]> = {
  super_admin: [
    "/dashboard",
    "/users",
    "/whatsapp-outreach",
    "/templates",
    "/contact-sections",
    "/interested-people",
    "/baileys",
    "/channel-accounts",
    "/channels",
  ],
  admin: [
    "/dashboard",
    "/whatsapp-outreach",
    "/templates",
    "/contact-sections",
    "/interested-people",
    "/baileys",
    "/channel-accounts",
    "/channels",
  ],
  manager: ["/dashboard", "/whatsapp-outreach", "/templates", "/contact-sections", "/interested-people"],
  viewer: ["/interested-people"],
};

export function getDefaultPathForRole(role: DashboardRole): string {
  return role === "viewer" ? "/interested-people" : "/dashboard";
}

export function canAccessPath(role: DashboardRole, pathname: string): boolean {
  return ROLE_PATHS[role]?.includes(pathname) ?? false;
}
