import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { idsMatch, isClientUserRole, resolveScopedChannelAccount } from "../auth/auth.scope";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import {
  ContactSectionContactDocument,
  ContactSectionDocument,
  ContactSectionModel,
} from "./contact-section.model";
import {
  CreateContactSectionBody,
  UpdateContactSectionBody,
  ContactSectionContact,
} from "./contact-section.types";
import {
  normalizeContactSectionContacts,
  recalculateContactSectionMetrics,
} from "./contact-section.service";

type AuthScopedRequest = Pick<Request, "authUser">;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseName(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const name = value.trim().slice(0, 120);
  return name.length >= 2 ? name : null;
}

function parseDescription(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  return value.trim().slice(0, 500);
}

async function resolveWritableChannelAccountId(
  req: AuthScopedRequest,
  channelAccountIdValue: unknown
): Promise<{ isValid: boolean; statusCode?: number; message?: string; channelAccountId?: string }> {
  if (isClientUserRole(req.authUser?.role)) {
    const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
    if (!scopedChannelAccount) {
      return {
        isValid: false,
        statusCode: 403,
        message: "Client channel account scope is not configured.",
      };
    }

    if (
      isNonEmptyString(channelAccountIdValue) &&
      !idsMatch(scopedChannelAccount._id, channelAccountIdValue.trim())
    ) {
      return {
        isValid: false,
        statusCode: 404,
        message: "Channel account not found.",
      };
    }

    return {
      isValid: true,
      channelAccountId: String(scopedChannelAccount._id),
    };
  }

  if (!isNonEmptyString(channelAccountIdValue) || !mongoose.isValidObjectId(channelAccountIdValue)) {
    return {
      isValid: false,
      statusCode: 400,
      message: "Field 'channelAccountId' must be a valid ObjectId.",
    };
  }

  return {
    isValid: true,
    channelAccountId: channelAccountIdValue.trim(),
  };
}

async function getSectionFilterForRequest(
  req: AuthScopedRequest
): Promise<{ isValid: boolean; statusCode?: number; message?: string; filter?: Record<string, unknown> }> {
  if (!isClientUserRole(req.authUser?.role)) {
    return { isValid: true, filter: {} };
  }

  const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
  if (!scopedChannelAccount) {
    return {
      isValid: false,
      statusCode: 403,
      message: "Client channel account scope is not configured.",
    };
  }

  return {
    isValid: true,
    filter: { channelAccountId: scopedChannelAccount._id },
  };
}

async function canAccessSection(
  req: AuthScopedRequest,
  section: ContactSectionDocument
): Promise<boolean> {
  if (!isClientUserRole(req.authUser?.role)) {
    return true;
  }

  const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
  return Boolean(scopedChannelAccount && idsMatch(scopedChannelAccount._id, section.channelAccountId));
}

function preserveExistingContactState(
  contacts: ContactSectionContact[],
  existingContacts: ContactSectionContactDocument[]
): ContactSectionContact[] {
  const existingByRef = new Map(
    existingContacts.map((contact) => [contact.channelUserRef, contact])
  );

  return contacts.map((contact) => {
    const existingContact = existingByRef.get(contact.channelUserRef);
    if (!existingContact) {
      return contact;
    }

    return {
      ...contact,
      lastDeliveryStatus: existingContact.lastDeliveryStatus,
      lastCampaignId: existingContact.lastCampaignId,
      lastAttemptAt: existingContact.lastAttemptAt,
      lastSentAt: existingContact.lastSentAt,
      lastErrorMessage: existingContact.lastErrorMessage,
      sendCount: existingContact.sendCount,
    };
  });
}

async function serializeSection(section: ContactSectionDocument) {
  return {
    _id: String(section._id),
    channelAccountId: String(section.channelAccountId),
    name: section.name,
    description: section.description ?? null,
    contacts: section.contacts.map((contact) => ({
      _id: String(contact._id),
      phoneNumber: contact.phoneNumber,
      displayName: contact.displayName ?? null,
      channelUserRef: contact.channelUserRef,
      approved: contact.approved,
      lastDeliveryStatus: contact.lastDeliveryStatus,
      lastCampaignId: contact.lastCampaignId ? String(contact.lastCampaignId) : null,
      lastAttemptAt: contact.lastAttemptAt?.toISOString() ?? null,
      lastSentAt: contact.lastSentAt?.toISOString() ?? null,
      lastErrorMessage: contact.lastErrorMessage ?? null,
      sendCount: contact.sendCount,
    })),
    totalContacts: section.totalContacts,
    approvedContacts: section.approvedContacts,
    pendingContacts: section.pendingContacts,
    sentContacts: section.sentContacts,
    failedContacts: section.failedContacts,
    createdAt: section.createdAt?.toISOString(),
    updatedAt: section.updatedAt?.toISOString(),
  };
}

export async function getContactSections(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedFilter = await getSectionFilterForRequest(req);
    if (!scopedFilter.isValid || !scopedFilter.filter) {
      sendError(res, scopedFilter.message ?? "Unable to resolve contact section scope.", scopedFilter.statusCode ?? 403);
      return;
    }

    const sections = await ContactSectionModel.find(scopedFilter.filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .exec();

    sendSuccess(res, { data: await Promise.all(sections.map(serializeSection)) });
  } catch (error) {
    next(error);
  }
}

export async function getContactSectionById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid contact section id.", 400);
      return;
    }

    const section = await ContactSectionModel.findById(req.params.id).exec();
    if (!section || !(await canAccessSection(req, section))) {
      sendError(res, "Contact section not found.", 404);
      return;
    }

    sendSuccess(res, { data: await serializeSection(section) });
  } catch (error) {
    next(error);
  }
}

export async function createContactSection(
  req: Request<unknown, unknown, CreateContactSectionBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedChannelAccount = await resolveWritableChannelAccountId(
      req,
      req.body.channelAccountId
    );
    if (!scopedChannelAccount.isValid || !scopedChannelAccount.channelAccountId) {
      sendError(
        res,
        scopedChannelAccount.message ?? "Unable to resolve channel account.",
        scopedChannelAccount.statusCode ?? 400
      );
      return;
    }

    const channelAccount = await ChannelAccountModel.findById(scopedChannelAccount.channelAccountId)
      .select("_id")
      .lean();
    if (!channelAccount) {
      sendError(res, "Channel account not found.", 404);
      return;
    }

    const name = parseName(req.body.name);
    if (!name) {
      sendError(res, "Field 'name' is required and must be at least 2 characters.", 400);
      return;
    }

    const normalizedContacts = normalizeContactSectionContacts(req.body.contacts);
    if (!normalizedContacts.isValid || !normalizedContacts.contacts) {
      sendError(res, normalizedContacts.message ?? "Invalid contacts.", 400);
      return;
    }

    const section = new ContactSectionModel({
      channelAccountId: new mongoose.Types.ObjectId(scopedChannelAccount.channelAccountId),
      name,
      description: parseDescription(req.body.description),
      contacts: normalizedContacts.contacts,
      createdBy: req.authUser
        ? {
            username: req.authUser.username,
            role: req.authUser.role,
          }
        : undefined,
    });
    recalculateContactSectionMetrics(section);
    await section.save();

    sendSuccess(res, {
      data: await serializeSection(section),
      statusCode: 201,
      message: "Contact section saved. / تم حفظ قسم جهات الاتصال.",
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      sendError(res, "A contact section with this name already exists for this account.", 409);
      return;
    }

    next(error);
  }
}

export async function updateContactSection(
  req: Request<{ id: string }, unknown, UpdateContactSectionBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid contact section id.", 400);
      return;
    }

    const section = await ContactSectionModel.findById(req.params.id).exec();
    if (!section || !(await canAccessSection(req, section))) {
      sendError(res, "Contact section not found.", 404);
      return;
    }

    const name = parseName(req.body.name);
    if (name) {
      section.name = name;
    }

    section.description = parseDescription(req.body.description);

    if (req.body.contacts !== undefined) {
      const normalizedContacts = normalizeContactSectionContacts(req.body.contacts);
      if (!normalizedContacts.isValid || !normalizedContacts.contacts) {
        sendError(res, normalizedContacts.message ?? "Invalid contacts.", 400);
        return;
      }

      const mergedContacts = preserveExistingContactState(
        normalizedContacts.contacts,
        section.contacts
      );
      section.set("contacts", mergedContacts);
    }

    recalculateContactSectionMetrics(section);
    await section.save();

    sendSuccess(res, {
      data: await serializeSection(section),
      message: "Contact section updated. / تم تحديث قسم جهات الاتصال.",
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      sendError(res, "A contact section with this name already exists for this account.", 409);
      return;
    }

    next(error);
  }
}

export async function deleteContactSection(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid contact section id.", 400);
      return;
    }

    const section = await ContactSectionModel.findById(req.params.id).exec();
    if (!section || !(await canAccessSection(req, section))) {
      sendError(res, "Contact section not found.", 404);
      return;
    }

    await section.deleteOne();
    sendSuccess(res, { message: "Contact section deleted. / تم حذف قسم جهات الاتصال." });
  } catch (error) {
    next(error);
  }
}
