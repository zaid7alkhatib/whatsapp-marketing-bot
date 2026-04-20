import crypto from "crypto";
import { env } from "../../config/env";
import { DashboardUserModel } from "../dashboard-users/dashboard-user.model";
import type { AuthLoginResult, AuthRole, AuthTokenPayload, AuthUserProfile } from "./auth.types";

interface AuthCredentialRecord {
  username: string;
  password: string;
  role: AuthRole;
}

const AUTH_CREDENTIALS: AuthCredentialRecord[] = [
  {
    username: env.dashboardAdminUsername,
    password: env.dashboardAdminPassword,
    role: "admin",
  },
];

const PASSWORD_HASH_PREFIX = "s1";
const PASSWORD_HASH_KEY_LENGTH = 64;

function createScryptHash(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH)
    .toString("hex");
}

function timingSafeStringCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalizedValue.length % 4)) % 4;
  const paddedValue = normalizedValue + "=".repeat(paddingLength);
  return Buffer.from(paddedValue, "base64").toString("utf-8");
}

function createSignature(payloadSegment: string): string {
  return crypto
    .createHmac("sha256", env.authTokenSecret)
    .update(payloadSegment)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isAuthRole(value: unknown): value is AuthRole {
  return value === "admin" || value === "user";
}

function isOptionalScopeId(value: unknown): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim().length > 0)
  );
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuthTokenPayload>;
  const scopedFlowId =
    typeof candidate.scopedFlowId === "string"
      ? candidate.scopedFlowId.trim()
      : candidate.scopedFlowId;
  const scopedChannelAccountId =
    typeof candidate.scopedChannelAccountId === "string"
      ? candidate.scopedChannelAccountId.trim()
      : candidate.scopedChannelAccountId;

  return (
    typeof candidate.username === "string" &&
    candidate.username.trim().length > 0 &&
    isAuthRole(candidate.role) &&
    isOptionalScopeId(scopedFlowId) &&
    isOptionalScopeId(scopedChannelAccountId) &&
    isPositiveFiniteNumber(candidate.iat) &&
    isPositiveFiniteNumber(candidate.exp)
  );
}

function sanitizeUserProfile(payload: AuthTokenPayload): AuthUserProfile {
  return {
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
    displayName: payload.displayName,
    scopedFlowId: payload.scopedFlowId ?? null,
    scopedChannelAccountId: payload.scopedChannelAccountId ?? null,
  };
}

export function createAuthToken(user: AuthUserProfile): AuthLoginResult {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + env.authTokenTtlHours * 60 * 60;

  const payload: AuthTokenPayload = {
    userId: user.userId,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    scopedFlowId: user.scopedFlowId ?? null,
    scopedChannelAccountId: user.scopedChannelAccountId ?? null,
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signatureSegment = createSignature(payloadSegment);

  return {
    token: `${payloadSegment}.${signatureSegment}`,
    user: sanitizeUserProfile(payload),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return null;
  }

  const [payloadSegment, signatureSegment] = trimmedToken.split(".");
  if (!payloadSegment || !signatureSegment) {
    return null;
  }

  const expectedSignature = createSignature(payloadSegment);
  const providedSignatureBuffer = Buffer.from(signatureSegment, "utf-8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf-8");

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(base64UrlDecode(payloadSegment)) as unknown;
    if (!isAuthTokenPayload(parsedPayload)) {
      return null;
    }

    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    if (parsedPayload.exp <= currentTimeSeconds) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}

export function createPasswordHash(password: string): string {
  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    throw new Error("Password must be a non-empty string.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = createScryptHash(trimmedPassword, salt);

  return `${PASSWORD_HASH_PREFIX}:${salt}:${hash}`;
}

function verifyPasswordHash(password: string, passwordHash: string): boolean {
  const [hashPrefix, salt, storedHash] = passwordHash.split(":");

  if (
    hashPrefix !== PASSWORD_HASH_PREFIX ||
    !salt ||
    !storedHash ||
    storedHash.length === 0
  ) {
    return false;
  }

  const computedHash = createScryptHash(password, salt);
  return timingSafeStringCompare(computedHash, storedHash);
}

function authenticateWithEnvFallback(
  normalizedUsername: string,
  password: string
): AuthLoginResult | null {
  const matchedCredential = AUTH_CREDENTIALS.find(
    (credential) =>
      normalizeUsername(credential.username) === normalizedUsername &&
      credential.password === password
  );

  if (!matchedCredential) {
    return null;
  }

  return createAuthToken({
    username: matchedCredential.username,
    role: matchedCredential.role,
  });
}

export async function authenticateDashboardUser(
  usernameValue: unknown,
  passwordValue: unknown
): Promise<AuthLoginResult | null> {
  const normalizedUsername = normalizeUsername(usernameValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!normalizedUsername || !password) {
    return null;
  }

  const dashboardUser = await DashboardUserModel.findOne({ username: normalizedUsername })
    .select(
      "_id username passwordHash role status displayName scopedFlowId scopedChannelAccountId"
    )
    .lean();

  if (dashboardUser) {
    if (dashboardUser.status !== "active") {
      return null;
    }

    const passwordIsValid = verifyPasswordHash(password, dashboardUser.passwordHash);
    if (!passwordIsValid) {
      return null;
    }

    return createAuthToken({
      userId: String(dashboardUser._id),
      username: dashboardUser.username,
      role: dashboardUser.role,
      displayName: dashboardUser.displayName ?? undefined,
      scopedFlowId: dashboardUser.scopedFlowId
        ? String(dashboardUser.scopedFlowId)
        : null,
      scopedChannelAccountId: dashboardUser.scopedChannelAccountId
        ? String(dashboardUser.scopedChannelAccountId)
        : null,
    });
  }

  return authenticateWithEnvFallback(normalizedUsername, password);
}
