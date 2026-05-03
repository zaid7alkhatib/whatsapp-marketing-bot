import { Types } from "mongoose";

export interface LocalizedNameSnapshot {
  ar?: string;
  en?: string;
  de?: string;
}

export interface ServiceRequestEntitySnapshot {
  code: string;
  name?: LocalizedNameSnapshot;
}

export interface ServiceRequestSnapshots {
  service?: ServiceRequestEntitySnapshot;
  requestType?: ServiceRequestEntitySnapshot;
  orgUnit?: ServiceRequestEntitySnapshot;
}

export interface ServiceRequest {
  orgUnitId?: Types.ObjectId | null;
  businessPartnerId?: Types.ObjectId | null;
  sessionId?: Types.ObjectId | null;
  serviceId: Types.ObjectId;
  requestTypeId: Types.ObjectId;
  statusCode: string;
  priorityCode?: string;
  sourceChannelCode?: string;
  language?: string;
  submittedAt: Date;
  assignedToUserId?: Types.ObjectId | null;
  requestData: Record<string, unknown>;
  aiSummary?: Record<string, unknown>;
  resolutionData?: Record<string, unknown>;
  snapshots?: ServiceRequestSnapshots;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceRequestBody {
  orgUnitId?: unknown;
  businessPartnerId?: unknown;
  sessionId?: unknown;
  serviceId?: unknown;
  requestTypeId?: unknown;
  statusCode?: unknown;
  priorityCode?: unknown;
  sourceChannelCode?: unknown;
  language?: unknown;
  submittedAt?: unknown;
  assignedToUserId?: unknown;
  requestData?: unknown;
  aiSummary?: unknown;
  resolutionData?: unknown;
  snapshots?: {
    service?: unknown;
    requestType?: unknown;
    orgUnit?: unknown;
  };
}
