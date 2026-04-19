import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BusinessPartnerModel } from "./business-partner.model";
import {
  BUSINESS_PARTNER_STATUSES,
  BUSINESS_PARTNER_SUBTYPES,
  BUSINESS_PARTNER_TYPES,
  BusinessPartnerStatus,
  BusinessPartnerSubtype,
  BusinessPartnerType,
  CreateBusinessPartnerBody,
} from "./business-partner.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseOptionalDate(value: unknown): { isValid: boolean; date?: Date; message?: string } {
  if (value === undefined || value === null) {
    return { isValid: true };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { isValid: true, date: value };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return { isValid: true, date: parsed };
    }
  }

  return { isValid: false, message: "must be a valid ISO date string." };
}

function parseCreateBody(body: CreateBusinessPartnerBody): {
  isValid: boolean;
  message?: string;
  data?: {
    type: BusinessPartnerType;
    subtype: BusinessPartnerSubtype;
    status: BusinessPartnerStatus;
    names: {
      fullName: string;
      firstName?: string;
      lastName?: string;
    };
    personalInfo?: {
      dateOfBirth?: Date;
      gender?: string;
    };
    contactInfo?: {
      phone?: string;
      email?: string;
    };
    preferredLanguage?: string;
    identifiers?: {
      externalRef?: string;
      insuranceNumber?: string;
      patientNumber?: string;
    };
    tags?: string[];
  };
} {
  if (!isNonEmptyString(body.type) || !BUSINESS_PARTNER_TYPES.includes(body.type as BusinessPartnerType)) {
    return {
      isValid: false,
      message: `Field 'type' must be one of: ${BUSINESS_PARTNER_TYPES.join(", ")}.`,
    };
  }

  if (
    !isNonEmptyString(body.subtype) ||
    !BUSINESS_PARTNER_SUBTYPES.includes(body.subtype as BusinessPartnerSubtype)
  ) {
    return {
      isValid: false,
      message: `Field 'subtype' must be one of: ${BUSINESS_PARTNER_SUBTYPES.join(", ")}.`,
    };
  }

  const status = body.status ?? "active";
  if (!isNonEmptyString(status) || !BUSINESS_PARTNER_STATUSES.includes(status as BusinessPartnerStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${BUSINESS_PARTNER_STATUSES.join(", ")}.`,
    };
  }

  if (!isPlainObject(body.names)) {
    return { isValid: false, message: "Field 'names' is required." };
  }

  if (!isNonEmptyString(body.names.fullName)) {
    return {
      isValid: false,
      message: "Field 'names.fullName' is required and must be a non-empty string.",
    };
  }

  if (body.names.firstName !== undefined && !isNonEmptyString(body.names.firstName)) {
    return { isValid: false, message: "Field 'names.firstName' must be a non-empty string." };
  }

  if (body.names.lastName !== undefined && !isNonEmptyString(body.names.lastName)) {
    return { isValid: false, message: "Field 'names.lastName' must be a non-empty string." };
  }

  if (body.personalInfo !== undefined && !isPlainObject(body.personalInfo)) {
    return { isValid: false, message: "Field 'personalInfo' must be an object." };
  }

  const parsedDateOfBirth = parseOptionalDate(body.personalInfo?.dateOfBirth);
  if (!parsedDateOfBirth.isValid) {
    return {
      isValid: false,
      message: `Field 'personalInfo.dateOfBirth' ${parsedDateOfBirth.message}`,
    };
  }

  if (body.personalInfo?.gender !== undefined && !isNonEmptyString(body.personalInfo.gender)) {
    return { isValid: false, message: "Field 'personalInfo.gender' must be a non-empty string." };
  }

  if (body.contactInfo !== undefined && !isPlainObject(body.contactInfo)) {
    return { isValid: false, message: "Field 'contactInfo' must be an object." };
  }

  if (body.contactInfo?.phone !== undefined && !isNonEmptyString(body.contactInfo.phone)) {
    return { isValid: false, message: "Field 'contactInfo.phone' must be a non-empty string." };
  }

  if (body.contactInfo?.email !== undefined && !isNonEmptyString(body.contactInfo.email)) {
    return { isValid: false, message: "Field 'contactInfo.email' must be a non-empty string." };
  }

  if (body.preferredLanguage !== undefined && !isNonEmptyString(body.preferredLanguage)) {
    return { isValid: false, message: "Field 'preferredLanguage' must be a non-empty string." };
  }

  if (body.identifiers !== undefined && !isPlainObject(body.identifiers)) {
    return { isValid: false, message: "Field 'identifiers' must be an object." };
  }

  if (body.identifiers?.externalRef !== undefined && !isNonEmptyString(body.identifiers.externalRef)) {
    return { isValid: false, message: "Field 'identifiers.externalRef' must be a non-empty string." };
  }

  if (
    body.identifiers?.insuranceNumber !== undefined &&
    !isNonEmptyString(body.identifiers.insuranceNumber)
  ) {
    return {
      isValid: false,
      message: "Field 'identifiers.insuranceNumber' must be a non-empty string.",
    };
  }

  if (
    body.identifiers?.patientNumber !== undefined &&
    !isNonEmptyString(body.identifiers.patientNumber)
  ) {
    return {
      isValid: false,
      message: "Field 'identifiers.patientNumber' must be a non-empty string.",
    };
  }

  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return { isValid: false, message: "Field 'tags' must be an array of non-empty strings." };
  }

  if (Array.isArray(body.tags)) {
    const invalidTag = body.tags.find((tag) => !isNonEmptyString(tag));
    if (invalidTag !== undefined) {
      return { isValid: false, message: "Field 'tags' must be an array of non-empty strings." };
    }
  }

  const cleanedTags = Array.isArray(body.tags)
    ? body.tags.map((tag) => tag.trim()).filter((tag, index, arr) => arr.indexOf(tag) === index)
    : undefined;

  const personalInfo =
    body.personalInfo && (parsedDateOfBirth.date || body.personalInfo.gender)
      ? {
          dateOfBirth: parsedDateOfBirth.date,
          gender: body.personalInfo.gender?.trim(),
        }
      : undefined;

  const contactInfo =
    body.contactInfo && (body.contactInfo.phone || body.contactInfo.email)
      ? {
          phone: body.contactInfo.phone?.trim(),
          email: body.contactInfo.email?.trim().toLowerCase(),
        }
      : undefined;

  const identifiers =
    body.identifiers &&
    (body.identifiers.externalRef ||
      body.identifiers.insuranceNumber ||
      body.identifiers.patientNumber)
      ? {
          externalRef: body.identifiers.externalRef?.trim(),
          insuranceNumber: body.identifiers.insuranceNumber?.trim(),
          patientNumber: body.identifiers.patientNumber?.trim(),
        }
      : undefined;

  return {
    isValid: true,
    data: {
      type: body.type as BusinessPartnerType,
      subtype: body.subtype as BusinessPartnerSubtype,
      status: status as BusinessPartnerStatus,
      names: {
        fullName: body.names.fullName.trim(),
        firstName: body.names.firstName?.trim(),
        lastName: body.names.lastName?.trim(),
      },
      personalInfo,
      contactInfo,
      preferredLanguage: body.preferredLanguage?.trim(),
      identifiers,
      tags: cleanedTags,
    },
  };
}

export async function getBusinessPartners(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const businessPartners = await BusinessPartnerModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: businessPartners,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBusinessPartnerById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid business partner id.",
      });
      return;
    }

    const businessPartner = await BusinessPartnerModel.findById(id).lean();

    if (!businessPartner) {
      res.status(404).json({
        success: false,
        message: "Business partner not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: businessPartner,
    });
  } catch (error) {
    next(error);
  }
}

export async function createBusinessPartner(
  req: Request<unknown, unknown, CreateBusinessPartnerBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = parseCreateBody(req.body);

    if (!parsed.isValid || !parsed.data) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const businessPartner = await BusinessPartnerModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: businessPartner,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessPartner(
  req: Request<{ id: string }, unknown, CreateBusinessPartnerBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid business partner id.",
      });
      return;
    }

    const parsed = parseCreateBody(req.body);

    if (!parsed.isValid || !parsed.data) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const existingBusinessPartner = await BusinessPartnerModel.findById(id);
    if (!existingBusinessPartner) {
      res.status(404).json({
        success: false,
        message: "Business partner not found.",
      });
      return;
    }

    existingBusinessPartner.type = parsed.data.type;
    existingBusinessPartner.subtype = parsed.data.subtype;
    existingBusinessPartner.status = parsed.data.status;
    existingBusinessPartner.names = parsed.data.names;
    existingBusinessPartner.personalInfo = parsed.data.personalInfo;
    existingBusinessPartner.contactInfo = parsed.data.contactInfo;
    existingBusinessPartner.preferredLanguage = parsed.data.preferredLanguage;
    existingBusinessPartner.identifiers = parsed.data.identifiers;
    existingBusinessPartner.tags = parsed.data.tags;

    const updatedBusinessPartner = await existingBusinessPartner.save();

    res.status(200).json({
      success: true,
      data: updatedBusinessPartner,
    });
  } catch (error) {
    next(error);
  }
}
