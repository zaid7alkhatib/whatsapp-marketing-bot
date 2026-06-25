import dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw new Error('Missing required environment variable: ' + key);
  }

  return value;
}

function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function getCsvEnv(key: string, defaultValue = ""): string[] {
  const rawValue = getOptionalEnv(key) ?? defaultValue;

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const env = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: Number(getEnv('PORT', '5000')),
  mongoUri: getEnv('MONGODB_URI'),
  corsOrigins: getCsvEnv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
  appBaseUrl: getOptionalEnv("APP_BASE_URL"),
  baileysAuthBasePath: getEnv("BAILEYS_AUTH_BASE_PATH", ".baileys-auth"),
  authTokenSecret: getEnv("AUTH_TOKEN_SECRET", "change-me-before-production"),
  authTokenTtlHours: Number(getEnv("AUTH_TOKEN_TTL_HOURS", "168")),
  dashboardAdminUsername: getEnv("DASHBOARD_ADMIN_USERNAME", "admin"),
  dashboardAdminPassword: getEnv("DASHBOARD_ADMIN_PASSWORD", "admin123456"),
  dashboardUserUsername: getEnv("DASHBOARD_USER_USERNAME", "client"),
  dashboardUserPassword: getEnv("DASHBOARD_USER_PASSWORD", "client123456"),
  dashboardUserChannelAccountId: getOptionalEnv("DASHBOARD_USER_CHANNEL_ACCOUNT_ID"),
  dashboardUserChannelAccountCode: getOptionalEnv("DASHBOARD_USER_CHANNEL_ACCOUNT_CODE"),
};
