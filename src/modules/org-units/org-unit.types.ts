import { Types } from "mongoose";

export const ORG_UNIT_TYPES = ["clinic", "pharmacy", "workshop", "branch"] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const ORG_UNIT_STATUSES = ["active", "inactive"] as const;
export type OrgUnitStatus = (typeof ORG_UNIT_STATUSES)[number];

export interface LocalizedOrgUnitName {
  ar: string;
  en: string;
  de: string;
}

export interface OrgUnitContactInfo {
  phone?: string;
  email?: string;
  address?: string;
}

export interface OrgUnitSettings {
  registeredUsersOnly: boolean;
  insuranceQuarterValidation: boolean;
}

export interface OrgUnit {
  code: string;
  type: OrgUnitType;
  status: OrgUnitStatus;
  name: LocalizedOrgUnitName;
  parentOrgUnitId?: Types.ObjectId | null;
  contactInfo?: OrgUnitContactInfo;
  settings: OrgUnitSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateOrgUnitBody {
  code?: unknown;
  type?: unknown;
  status?: unknown;
  name?: {
    ar?: unknown;
    en?: unknown;
    de?: unknown;
  };
  parentOrgUnitId?: unknown;
  contactInfo?: {
    phone?: unknown;
    email?: unknown;
    address?: unknown;
  };
  settings?: {
    registeredUsersOnly?: unknown;
    insuranceQuarterValidation?: unknown;
  };
}
