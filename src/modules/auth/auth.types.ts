export type AuthRole = "admin" | "user";

export interface AuthUserProfile {
  userId?: string;
  username: string;
  role: AuthRole;
  displayName?: string;
  scopedFlowId?: string | null;
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
