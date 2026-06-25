import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import {
  getBaileysStatus,
  sendBaileysTextMessage,
} from "../../integrations/baileys/baileys.service";
import { idsMatch, isClientUserRole, resolveScopedChannelAccount } from "../auth/auth.scope";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { ContactSectionModel } from "../contact-sections/contact-section.model";
import { markSectionContactDelivery } from "../contact-sections/contact-section.service";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import { OutreachCampaignDocument, OutreachCampaignModel } from "./whatsapp-outreach.model";
import {
  CreateOutreachCampaignBody,
  CreateOutreachRecipientBody,
  OUTREACH_CONSENT_STATUSES,
  OutreachCampaignRecipient,
  OutreachConsentStatus,
} from "./whatsapp-outreach.types";
import {
  DEFAULT_MARKETING_MESSAGE_TEMPLATE,
  MarketingMessageTemplate,
  buildPersonalizedMarketingMessage,
} from "./message-personalization";

const MAX_RECIPIENTS_PER_CAMPAIGN = 250;
const MAX_PERSONALIZED_MESSAGE_LENGTH = 4200;
const MAX_TEMPLATE_LINE_LENGTH = 500;
const DEFAULT_INTEREST_TRIGGERS = [
  "1",
  "interested",
  "interest",
  "مهتم",
  "مهتمة",
  "نعم",
];
const DELIVERY_DELAY_MS = 2500;

const activeCampaignIds = new Set<string>();
const cancelledCampaignIds = new Set<string>();

type AuthScopedRequest = Pick<Request, "authUser">;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Unknown delivery error.";
}

function normalizePhoneNumber(value: unknown): {
  phoneNumber?: string;
  channelUserRef?: string;
  message?: string;
} {
  if (!isNonEmptyString(value)) {
    return { message: "Every selected recipient needs a phone number." };
  }

  let digits = value.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    return {
      message:
        "Phone numbers must include a country code and contain 8 to 15 digits.",
    };
  }

  return {
    phoneNumber: `+${digits}`,
    channelUserRef: `${digits}@s.whatsapp.net`,
  };
}

function parseConsentStatus(value: unknown): OutreachConsentStatus {
  if (isNonEmptyString(value)) {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "approved") {
      return "opted_in";
    }
    if (normalizedValue === "needs_review" || normalizedValue === "pending") {
      return "not_confirmed";
    }
    if (normalizedValue === "blocked" || normalizedValue === "do_not_send") {
      return "opted_out";
    }
  }

  if (
    isNonEmptyString(value) &&
    OUTREACH_CONSENT_STATUSES.includes(value as OutreachConsentStatus)
  ) {
    return value as OutreachConsentStatus;
  }

  return "not_confirmed";
}

function parseTitle(value: unknown): string {
  if (isNonEmptyString(value)) {
    return value.trim().slice(0, 160);
  }

  return `WhatsApp marketing ${new Date().toISOString().slice(0, 10)}`;
}

function parseMessage(value: unknown): { isValid: boolean; message?: string; data?: string } {
  if (!isNonEmptyString(value)) {
    return { isValid: false, message: "Field 'message' is required." };
  }

  const message = value.trim();
  if (message.length > 4000) {
    return { isValid: false, message: "Field 'message' must be 4000 characters or less." };
  }

  return { isValid: true, data: message };
}

function parseTemplateLine(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parsePersonalizationTemplate(value: unknown): MarketingMessageTemplate {
  if (!isPlainObject(value)) {
    return DEFAULT_MARKETING_MESSAGE_TEMPLATE;
  }

  return {
    englishGreeting: parseTemplateLine(
      value.englishGreeting,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishGreeting,
      300
    ),
    arabicGreeting: parseTemplateLine(
      value.arabicGreeting,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicGreeting,
      300
    ),
    englishResponseInstruction: parseTemplateLine(
      value.englishResponseInstruction,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishResponseInstruction,
      MAX_TEMPLATE_LINE_LENGTH
    ),
    arabicResponseInstruction: parseTemplateLine(
      value.arabicResponseInstruction,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicResponseInstruction,
      MAX_TEMPLATE_LINE_LENGTH
    ),
  };
}

function parseInterestTriggers(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[\n,؛;]+/)
    : DEFAULT_INTEREST_TRIGGERS;

  const seenTriggers = new Set<string>();
  const triggers: string[] = [];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const trigger = rawValue.replace(/\s+/g, " ").trim().slice(0, 80);
    const triggerKey = trigger.toLocaleLowerCase();
    if (!trigger || seenTriggers.has(triggerKey)) {
      continue;
    }

    seenTriggers.add(triggerKey);
    triggers.push(trigger);
  }

  return triggers.slice(0, 30);
}

function parseRecipientBody(value: unknown): CreateOutreachRecipientBody | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return value as CreateOutreachRecipientBody;
}

function parseOptionalObjectId(value: unknown): mongoose.Types.ObjectId | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return mongoose.isValidObjectId(normalizedValue)
    ? new mongoose.Types.ObjectId(normalizedValue)
    : undefined;
}

function normalizeRecipients(value: unknown): {
  isValid: boolean;
  message?: string;
  recipients?: OutreachCampaignRecipient[];
} {
  if (!Array.isArray(value)) {
    return { isValid: false, message: "Field 'recipients' must be an array." };
  }

  const selectedRecipientBodies = value
    .map(parseRecipientBody)
    .filter((recipient): recipient is CreateOutreachRecipientBody => {
      return Boolean(recipient) && recipient?.selected !== false;
    });

  if (selectedRecipientBodies.length === 0) {
    return { isValid: false, message: "Select at least one recipient." };
  }

  if (selectedRecipientBodies.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
    return {
      isValid: false,
      message: `A single campaign can include up to ${MAX_RECIPIENTS_PER_CAMPAIGN} selected recipients.`,
    };
  }

  const seenChannelRefs = new Set<string>();
  const recipients: OutreachCampaignRecipient[] = [];

  for (const recipientBody of selectedRecipientBodies) {
    const normalizedPhoneNumber = normalizePhoneNumber(recipientBody.phoneNumber);
    if (!normalizedPhoneNumber.phoneNumber || !normalizedPhoneNumber.channelUserRef) {
      return {
        isValid: false,
        message: normalizedPhoneNumber.message,
      };
    }

    const displayName = isNonEmptyString(recipientBody.displayName)
      ? recipientBody.displayName.trim().slice(0, 140)
      : undefined;
    const consentStatus = parseConsentStatus(recipientBody.consentStatus);
    const contactSectionId = parseOptionalObjectId(recipientBody.contactSectionId);
    const contactId = parseOptionalObjectId(recipientBody.contactId);

    if (
      (recipientBody.contactSectionId !== undefined && !contactSectionId) ||
      (recipientBody.contactId !== undefined && !contactId)
    ) {
      return {
        isValid: false,
        message: "Contact section references must be valid ObjectIds.",
      };
    }

    if (seenChannelRefs.has(normalizedPhoneNumber.channelUserRef)) {
      recipients.push({
        phoneNumber: normalizedPhoneNumber.phoneNumber,
        displayName,
        channelUserRef: normalizedPhoneNumber.channelUserRef,
        contactSectionId,
        contactId,
        consentStatus,
        status: "skipped",
        skippedReason: "Duplicate recipient in this campaign.",
      });
      continue;
    }

    seenChannelRefs.add(normalizedPhoneNumber.channelUserRef);

    if (consentStatus !== "opted_in") {
      recipients.push({
        phoneNumber: normalizedPhoneNumber.phoneNumber,
        displayName,
        channelUserRef: normalizedPhoneNumber.channelUserRef,
        contactSectionId,
        contactId,
        consentStatus,
        status: "skipped",
        skippedReason: "Recipient is not approved for this campaign.",
      });
      continue;
    }

    recipients.push({
      phoneNumber: normalizedPhoneNumber.phoneNumber,
      displayName,
      channelUserRef: normalizedPhoneNumber.channelUserRef,
      contactSectionId,
      contactId,
      consentStatus,
      status: "queued",
    });
  }

  return { isValid: true, recipients };
}

function attachPersonalizedMessages(
  recipients: OutreachCampaignRecipient[],
  message: string,
  template: MarketingMessageTemplate
): { isValid: boolean; message?: string; recipients?: OutreachCampaignRecipient[] } {
  const personalizedRecipients: OutreachCampaignRecipient[] = [];

  for (const recipient of recipients) {
    const personalizedMessage = buildPersonalizedMarketingMessage({
      message,
      displayName: recipient.displayName,
      template,
    });

    if (recipient.status === "queued" && personalizedMessage.length > MAX_PERSONALIZED_MESSAGE_LENGTH) {
      return {
        isValid: false,
        message:
          `The final message for ${recipient.displayName || recipient.phoneNumber} is too long after adding the greeting and reply instructions. Shorten the campaign message.`,
      };
    }

    personalizedRecipients.push({
      ...recipient,
      personalizedMessage,
    });
  }

  return { isValid: true, recipients: personalizedRecipients };
}

function recalculateCampaignMetrics(campaign: OutreachCampaignDocument): void {
  const recipients = campaign.recipients ?? [];

  campaign.totalRecipients = recipients.length;
  campaign.eligibleRecipients = recipients.filter(
    (recipient) => recipient.consentStatus === "opted_in" && !recipient.skippedReason
  ).length;
  campaign.sentCount = recipients.filter((recipient) => recipient.status === "sent").length;
  campaign.failedCount = recipients.filter((recipient) => recipient.status === "failed").length;
  campaign.skippedCount = recipients.filter((recipient) => recipient.status === "skipped").length;
}

async function validateContactSectionReferences(options: {
  channelAccountId: mongoose.Types.ObjectId;
  recipients: OutreachCampaignRecipient[];
}): Promise<{ isValid: boolean; message?: string }> {
  const sectionIds = Array.from(
    new Set(
      options.recipients
        .map((recipient) => recipient.contactSectionId)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
        .map((value) => String(value))
    )
  );

  if (sectionIds.length === 0) {
    return { isValid: true };
  }

  const sections = await ContactSectionModel.find({
    _id: { $in: sectionIds },
    channelAccountId: options.channelAccountId,
  }).exec();

  if (sections.length !== sectionIds.length) {
    return {
      isValid: false,
      message: "One or more selected contact sections were not found for this WhatsApp account.",
    };
  }

  const sectionsById = new Map(sections.map((section) => [String(section._id), section]));
  for (const recipient of options.recipients) {
    if (!recipient.contactSectionId || !recipient.contactId) {
      continue;
    }

    const section = sectionsById.get(String(recipient.contactSectionId));
    const contact = section?.contacts.id(String(recipient.contactId));
    if (!contact) {
      return {
        isValid: false,
        message: "One or more selected contacts were not found in their contact section.",
      };
    }
  }

  return { isValid: true };
}

async function markRecipientSectionDelivery(
  campaign: OutreachCampaignDocument,
  recipient: OutreachCampaignRecipient,
  status: "sent" | "failed" | "cancelled",
  errorMessage?: string
): Promise<void> {
  await markSectionContactDelivery({
    sectionId: recipient.contactSectionId,
    contactId: recipient.contactId,
    campaignId: campaign._id as mongoose.Types.ObjectId,
    status,
    errorMessage,
    sentAt: recipient.sentAt,
  });
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

async function getCampaignFilterForRequest(
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

async function canAccessCampaign(
  req: AuthScopedRequest,
  campaign: OutreachCampaignDocument
): Promise<boolean> {
  if (!isClientUserRole(req.authUser?.role)) {
    return true;
  }

  const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
  return Boolean(scopedChannelAccount && idsMatch(scopedChannelAccount._id, campaign.channelAccountId));
}

async function processOutreachCampaign(campaignId: string): Promise<void> {
  if (activeCampaignIds.has(campaignId)) {
    return;
  }

  activeCampaignIds.add(campaignId);

  try {
    const campaign = await OutreachCampaignModel.findById(campaignId).exec();
    if (!campaign) {
      return;
    }

    if (cancelledCampaignIds.has(campaignId) || campaign.status === "cancelled") {
      return;
    }

    campaign.status = "sending";
    campaign.startedAt = campaign.startedAt ?? new Date();
    campaign.errorMessage = undefined;
    await campaign.save();

    for (const recipient of campaign.recipients) {
      if (cancelledCampaignIds.has(campaignId)) {
        if (recipient.status === "queued" || recipient.status === "sending") {
          recipient.status = "cancelled";
          await markRecipientSectionDelivery(campaign, recipient, "cancelled");
        }
        continue;
      }

      if (recipient.status !== "queued") {
        continue;
      }

      recipient.status = "sending";
      recalculateCampaignMetrics(campaign);
      await campaign.save();

      try {
        const personalizedMessage =
          recipient.personalizedMessage ??
          buildPersonalizedMarketingMessage({
            message: campaign.message,
            displayName: recipient.displayName,
            template: campaign.personalizationTemplate,
          });

        await sendBaileysTextMessage(
          String(campaign.channelAccountId),
          recipient.channelUserRef,
          personalizedMessage
        );
        recipient.status = "sent";
        recipient.sentAt = new Date();
        recipient.errorMessage = undefined;
        await markRecipientSectionDelivery(campaign, recipient, "sent");
      } catch (error) {
        recipient.status = "failed";
        recipient.errorMessage = getErrorMessage(error);
        await markRecipientSectionDelivery(
          campaign,
          recipient,
          "failed",
          recipient.errorMessage
        );
      }

      recalculateCampaignMetrics(campaign);
      await campaign.save();
      await sleep(DELIVERY_DELAY_MS);
    }

    recalculateCampaignMetrics(campaign);

    if (cancelledCampaignIds.has(campaignId)) {
      campaign.status = "cancelled";
      campaign.cancelledAt = campaign.cancelledAt ?? new Date();
    } else {
      campaign.status = campaign.failedCount > 0 ? "completed_with_errors" : "completed";
    }

    campaign.completedAt = new Date();
    await campaign.save();
  } catch (error) {
    await OutreachCampaignModel.updateOne(
      { _id: campaignId },
      {
        status: "failed",
        errorMessage: getErrorMessage(error),
        completedAt: new Date(),
      }
    ).exec();
  } finally {
    activeCampaignIds.delete(campaignId);
    cancelledCampaignIds.delete(campaignId);
  }
}

export async function getOutreachCampaigns(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedFilter = await getCampaignFilterForRequest(req);
    if (!scopedFilter.isValid || !scopedFilter.filter) {
      sendError(res, scopedFilter.message ?? "Unable to resolve campaign scope.", scopedFilter.statusCode ?? 403);
      return;
    }

    const campaigns = await OutreachCampaignModel.find(scopedFilter.filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    sendSuccess(res, { data: campaigns });
  } catch (error) {
    next(error);
  }
}

export async function getOutreachCampaignById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid campaign id.", 400);
      return;
    }

    const campaign = await OutreachCampaignModel.findById(req.params.id).exec();
    if (!campaign || !(await canAccessCampaign(req, campaign))) {
      sendError(res, "Campaign not found.", 404);
      return;
    }

    sendSuccess(res, { data: campaign });
  } catch (error) {
    next(error);
  }
}

export async function createOutreachCampaign(
  req: Request<unknown, unknown, CreateOutreachCampaignBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.body.consentConfirmed !== true) {
      sendError(
        res,
        "Confirm this is a one-time approved marketing message before sending. / أكد أن هذه رسالة تسويقية معتمدة لمرة واحدة قبل الإرسال.",
        400
      );
      return;
    }

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
      .select("_id displayName code status")
      .lean();
    if (!channelAccount) {
      sendError(res, "Channel account not found.", 404);
      return;
    }

    const baileysStatus = getBaileysStatus(scopedChannelAccount.channelAccountId);
    if (!baileysStatus.connected) {
      sendError(
        res,
        "WhatsApp is not connected for this channel account. Pair it before sending a marketing campaign.",
        409
      );
      return;
    }

    const parsedMessage = parseMessage(req.body.message);
    if (!parsedMessage.isValid || !parsedMessage.data) {
      sendError(res, parsedMessage.message ?? "Invalid message.", 400);
      return;
    }
    const personalizationTemplate = parsePersonalizationTemplate(req.body.personalizationTemplate);
    const interestTriggers = parseInterestTriggers(req.body.interestTriggers);

    const normalizedRecipients = normalizeRecipients(req.body.recipients);
    if (!normalizedRecipients.isValid || !normalizedRecipients.recipients) {
      sendError(res, normalizedRecipients.message ?? "Invalid recipients.", 400);
      return;
    }

    const personalizedRecipients = attachPersonalizedMessages(
      normalizedRecipients.recipients,
      parsedMessage.data,
      personalizationTemplate
    );
    if (!personalizedRecipients.isValid || !personalizedRecipients.recipients) {
      sendError(res, personalizedRecipients.message ?? "Invalid personalized messages.", 400);
      return;
    }

    const eligibleRecipients = personalizedRecipients.recipients.filter(
      (recipient) => recipient.status === "queued"
    ).length;
    if (eligibleRecipients === 0) {
      sendError(res, "No selected recipients are approved for this campaign.", 400);
      return;
    }

    const channelAccountObjectId = new mongoose.Types.ObjectId(scopedChannelAccount.channelAccountId);
    const referencedSections = await validateContactSectionReferences({
      channelAccountId: channelAccountObjectId,
      recipients: personalizedRecipients.recipients,
    });
    if (!referencedSections.isValid) {
      sendError(res, referencedSections.message ?? "Invalid contact section references.", 400);
      return;
    }

    const activeCampaign = await OutreachCampaignModel.exists({
      channelAccountId: channelAccountObjectId,
      status: { $in: ["queued", "sending"] },
    });
    if (activeCampaign) {
      sendError(
        res,
        "Finish or cancel the active marketing campaign before sending another one.",
        409
      );
      return;
    }

    const campaign = await OutreachCampaignModel.create({
      channelAccountId: channelAccountObjectId,
      title: parseTitle(req.body.title),
      message: parsedMessage.data,
      messageWithOptOut: buildPersonalizedMarketingMessage({
        message: parsedMessage.data,
        template: personalizationTemplate,
      }),
      personalizationTemplate,
      interestTriggers,
      status: "queued",
      recipients: personalizedRecipients.recipients,
      totalRecipients: personalizedRecipients.recipients.length,
      eligibleRecipients,
      sentCount: 0,
      failedCount: 0,
      skippedCount: personalizedRecipients.recipients.filter(
        (recipient) => recipient.status === "skipped"
      ).length,
      consentConfirmed: true,
      createdBy: req.authUser
        ? {
            username: req.authUser.username,
            role: req.authUser.role,
          }
        : undefined,
    });

    void processOutreachCampaign(String(campaign._id));

    sendSuccess(res, {
      data: campaign,
      statusCode: 201,
      message: "Marketing campaign queued. / تم وضع الحملة التسويقية في قائمة الإرسال.",
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelOutreachCampaign(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid campaign id.", 400);
      return;
    }

    const campaign = await OutreachCampaignModel.findById(req.params.id).exec();
    if (!campaign || !(await canAccessCampaign(req, campaign))) {
      sendError(res, "Campaign not found.", 404);
      return;
    }

    if (!["queued", "sending"].includes(campaign.status)) {
      sendError(res, "Only queued or sending campaigns can be cancelled.", 409);
      return;
    }

    cancelledCampaignIds.add(String(campaign._id));

    for (const recipient of campaign.recipients) {
      if (recipient.status === "queued" || recipient.status === "sending") {
        recipient.status = "cancelled";
        await markRecipientSectionDelivery(campaign, recipient, "cancelled");
      }
    }

    campaign.status = "cancelled";
    campaign.cancelledAt = new Date();
    campaign.completedAt = new Date();
    recalculateCampaignMetrics(campaign);
    await campaign.save();

    sendSuccess(res, {
      data: campaign,
      message: "Marketing campaign cancelled. / تم إلغاء الحملة التسويقية.",
    });
  } catch (error) {
    next(error);
  }
}
