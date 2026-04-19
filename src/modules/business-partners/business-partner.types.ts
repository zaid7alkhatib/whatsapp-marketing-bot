export const BUSINESS_PARTNER_TYPES = ["person", "company"] as const;
export type BusinessPartnerType = (typeof BUSINESS_PARTNER_TYPES)[number];

export const BUSINESS_PARTNER_SUBTYPES = [
  "patient",
  "customer",
  "lead",
  "partner",
] as const;
export type BusinessPartnerSubtype = (typeof BUSINESS_PARTNER_SUBTYPES)[number];

export const BUSINESS_PARTNER_STATUSES = ["active", "inactive"] as const;
export type BusinessPartnerStatus = (typeof BUSINESS_PARTNER_STATUSES)[number];

export interface BusinessPartnerNames {
  fullName: string;
  firstName?: string;
  lastName?: string;
}

export interface BusinessPartnerPersonalInfo {
  dateOfBirth?: Date;
  gender?: string;
}

export interface BusinessPartnerContactInfo {
  phone?: string;
  email?: string;
}

export interface BusinessPartnerIdentifiers {
  externalRef?: string;
  insuranceNumber?: string;
  patientNumber?: string;
}

export interface BusinessPartner {
  type: BusinessPartnerType;
  subtype: BusinessPartnerSubtype;
  status: BusinessPartnerStatus;
  names: BusinessPartnerNames;
  personalInfo?: BusinessPartnerPersonalInfo;
  contactInfo?: BusinessPartnerContactInfo;
  preferredLanguage?: string;
  identifiers?: BusinessPartnerIdentifiers;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateBusinessPartnerBody {
  type?: unknown;
  subtype?: unknown;
  status?: unknown;
  names?: {
    fullName?: unknown;
    firstName?: unknown;
    lastName?: unknown;
  };
  personalInfo?: {
    dateOfBirth?: unknown;
    gender?: unknown;
  };
  contactInfo?: {
    phone?: unknown;
    email?: unknown;
  };
  preferredLanguage?: unknown;
  identifiers?: {
    externalRef?: unknown;
    insuranceNumber?: unknown;
    patientNumber?: unknown;
  };
  tags?: unknown;
}
