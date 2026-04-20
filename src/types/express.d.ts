import type { AuthTokenPayload } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenPayload;
    }
  }
}

export {};
