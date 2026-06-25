export type AuthRole = "super_admin" | "admin" | "manager" | "viewer";

export interface AuthUserProfile {
  userId?: string;
  username: string;
  role: AuthRole;
  displayName?: string;
  scopedChannelAccountId?: string | null;
}

export interface AuthTokenPayload extends AuthUserProfile {
  iat: number;
  exp: number;
}

export interface AuthLoginResult {
  token: string;
  user: AuthUserProfile;
  expiresAt: string;
}
