export const SERVICE_STATUSES = ["active", "inactive"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface ServiceName {
  ar?: string;
  en?: string;
  de?: string;
}

export interface ServiceConfig {
  requiresHumanReview?: boolean;
  aiEnabled?: boolean;
}

export interface Service {
  code: string;
  category?: string;
  status: ServiceStatus;
  name?: ServiceName;
  config?: ServiceConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateServiceBody {
  code?: unknown;
  category?: unknown;
  status?: unknown;
  name?: {
    ar?: unknown;
    en?: unknown;
    de?: unknown;
  };
  config?: {
    requiresHumanReview?: unknown;
    aiEnabled?: unknown;
  };
}
