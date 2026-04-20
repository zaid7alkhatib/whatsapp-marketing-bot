export type DashboardRole = "admin" | "user";

export interface AuthUser {
  username: string;
  role: DashboardRole;
}

export interface AuthLoginResult {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface AuthMeResult {
  user: AuthUser;
}
