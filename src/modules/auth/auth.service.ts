import crypto from "crypto";
import { env } from "../../config/env";
import { DashboardUserModel } from "../users/dashboard-user.model";
import type { AuthLoginResult, AuthRole, AuthTokenPayload, AuthUserProfile } from "./auth.types";

const PASSWORD_ALGORITHM = "scrypt";
const PASSWORD_KEY_LENGTH = 64;

export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isAuthRole(value: unknown): value is AuthRole {
  return (
    value === "super_admin" ||
    value === "admin" ||
    value === "manager" ||
    value === "viewer"
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, PASSWORD_KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });

  return `${PASSWORD_ALGORITHM}:${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== PASSWORD_ALGORITHM || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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
  return Buffer.from(normalizedValue + "=".repeat(paddingLength), "base64").toString("utf-8");
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
  return (
    typeof candidate.username === "string" &&
    candidate.username.trim().length > 0 &&
    isAuthRole(candidate.role) &&
    isOptionalScopeId(candidate.scopedChannelAccountId) &&
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
    scopedChannelAccountId: user.scopedChannelAccountId ?? null,
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  return {
    token: `${payloadSegment}.${createSignature(payloadSegment)}`,
    user: sanitizeUserProfile(payload),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [payloadSegment, signatureSegment] = token.trim().split(".");
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

    if (parsedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}

export async function authenticateDashboardUser(
  usernameValue: unknown,
  passwordValue: unknown
): Promise<AuthLoginResult | null> {
  const username = normalizeUsername(usernameValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!username || !password) {
    return null;
  }

  const user = await DashboardUserModel.findOne({ username, isActive: true }).exec();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return createAuthToken({
    userId: String(user._id),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });
}
