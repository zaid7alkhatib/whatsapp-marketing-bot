import dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw new Error('Missing required environment variable: ' + key);
  }

  return value;
}

export const env = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: Number(getEnv('PORT', '5000')),
  mongoUri: getEnv('MONGODB_URI'),
  baileysAuthBasePath: getEnv("BAILEYS_AUTH_BASE_PATH", ".baileys-auth"),
};
