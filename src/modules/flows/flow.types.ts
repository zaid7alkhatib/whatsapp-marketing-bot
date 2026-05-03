import { Types } from "mongoose";

export const FLOW_STATUSES = ["draft", "published", "archived"] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export interface FlowAppliesTo {
  channelCodes?: string[];
  orgUnitTypes?: string[];
}

export interface FlowSettings {
  allowResume?: boolean;
  sessionTimeoutMinutes?: number;
  createServiceRequestOnCompletion?: boolean;
  serviceId?: Types.ObjectId | string;
  requestTypeId?: Types.ObjectId | string;
  serviceRequestRouting?: Array<{
    whenDataKey?: string;
    equals?: string;
    serviceId?: Types.ObjectId | string;
    requestTypeId?: Types.ObjectId | string;
  }>;
}

export interface Flow {
  code: string;
  name: string;
  version: number;
  status: FlowStatus;
  startStepCode: string;
  appliesTo?: FlowAppliesTo;
  settings?: FlowSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateFlowBody {
  code?: unknown;
  name?: unknown;
  version?: unknown;
  status?: unknown;
  startStepCode?: unknown;
  appliesTo?: {
    channelCodes?: unknown;
    orgUnitTypes?: unknown;
  };
  settings?: {
    allowResume?: unknown;
    sessionTimeoutMinutes?: unknown;
    createServiceRequestOnCompletion?: unknown;
    serviceId?: unknown;
    requestTypeId?: unknown;
    serviceRequestRouting?: unknown;
  };
}
