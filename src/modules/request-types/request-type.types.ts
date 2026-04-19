import { Types } from "mongoose";

export const REQUEST_TYPE_STATUSES = ["active", "inactive"] as const;
export type RequestTypeStatus = (typeof REQUEST_TYPE_STATUSES)[number];

export interface RequestTypeName {
  ar?: string;
  en?: string;
  de?: string;
}

export interface RequestTypeConfig {
  requiresHumanReview?: boolean;
  aiTaskCodes?: string[];
  formDefinitionCode?: string;
}

export interface RequestType {
  serviceId: Types.ObjectId;
  code: string;
  status: RequestTypeStatus;
  name?: RequestTypeName;
  config?: RequestTypeConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateRequestTypeBody {
  serviceId?: unknown;
  code?: unknown;
  status?: unknown;
  name?: {
    ar?: unknown;
    en?: unknown;
    de?: unknown;
  };
  config?: {
    requiresHumanReview?: unknown;
    aiTaskCodes?: unknown;
    formDefinitionCode?: unknown;
  };
}
