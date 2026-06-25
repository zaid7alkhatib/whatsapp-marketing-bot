"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUsername = normalizeUsername;
exports.isAuthRole = isAuthRole;
exports.hashPassword = hashPassword;
exports.createAuthToken = createAuthToken;
exports.verifyAuthToken = verifyAuthToken;
exports.authenticateDashboardUser = authenticateDashboardUser;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const dashboard_user_model_1 = require("../users/dashboard-user.model");
const PASSWORD_ALGORITHM = "scrypt";
const PASSWORD_KEY_LENGTH = 64;
function normalizeUsername(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function isAuthRole(value) {
    return (value === "super_admin" ||
        value === "admin" ||
        value === "manager" ||
        value === "viewer");
}
async function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString("hex");
    const derivedKey = await new Promise((resolve, reject) => {
        crypto_1.default.scrypt(password, salt, PASSWORD_KEY_LENGTH, (error, key) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(key);
        });
    });
    return `${PASSWORD_ALGORITHM}:${salt}:${derivedKey.toString("hex")}`;
}
async function verifyPassword(password, storedHash) {
    const [algorithm, salt, hash] = storedHash.split(":");
    if (algorithm !== PASSWORD_ALGORITHM || !salt || !hash) {
        return false;
    }
    const expected = Buffer.from(hash, "hex");
    const actual = await new Promise((resolve, reject) => {
        crypto_1.default.scrypt(password, salt, expected.length, (error, key) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(key);
        });
    });
    return actual.length === expected.length && crypto_1.default.timingSafeEqual(actual, expected);
}
function base64UrlEncode(value) {
    return Buffer.from(value, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
function base64UrlDecode(value) {
    const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (normalizedValue.length % 4)) % 4;
    return Buffer.from(normalizedValue + "=".repeat(paddingLength), "base64").toString("utf-8");
}
function createSignature(payloadSegment) {
    return crypto_1.default
        .createHmac("sha256", env_1.env.authTokenSecret)
        .update(payloadSegment)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
function isPositiveFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isOptionalScopeId(value) {
    return (value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim().length > 0));
}
function isAuthTokenPayload(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.username === "string" &&
        candidate.username.trim().length > 0 &&
        isAuthRole(candidate.role) &&
        isOptionalScopeId(candidate.scopedChannelAccountId) &&
        isPositiveFiniteNumber(candidate.iat) &&
        isPositiveFiniteNumber(candidate.exp));
}
function sanitizeUserProfile(payload) {
    return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        displayName: payload.displayName,
        scopedChannelAccountId: payload.scopedChannelAccountId ?? null,
    };
}
function createAuthToken(user) {
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAtSeconds + env_1.env.authTokenTtlHours * 60 * 60;
    const payload = {
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
function verifyAuthToken(token) {
    const [payloadSegment, signatureSegment] = token.trim().split(".");
    if (!payloadSegment || !signatureSegment) {
        return null;
    }
    const expectedSignature = createSignature(payloadSegment);
    const providedSignatureBuffer = Buffer.from(signatureSegment, "utf-8");
    const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf-8");
    if (providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
        !crypto_1.default.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
        return null;
    }
    try {
        const parsedPayload = JSON.parse(base64UrlDecode(payloadSegment));
        if (!isAuthTokenPayload(parsedPayload)) {
            return null;
        }
        if (parsedPayload.exp <= Math.floor(Date.now() / 1000)) {
            return null;
        }
        return parsedPayload;
    }
    catch {
        return null;
    }
}
async function authenticateDashboardUser(usernameValue, passwordValue) {
    const username = normalizeUsername(usernameValue);
    const password = typeof passwordValue === "string" ? passwordValue : "";
    if (!username || !password) {
        return null;
    }
    const user = await dashboard_user_model_1.DashboardUserModel.findOne({ username, isActive: true }).exec();
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
