export type DashboardRole = "super_admin" | "admin" | "manager" | "viewer";

export interface AuthUser {
  userId?: string;
  username: string;
  role: DashboardRole;
  displayName?: string;
}

export interface AuthLoginResult {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface AuthMeResult {
  user: AuthUser;
}
