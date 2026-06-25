"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceRequests = getServiceRequests;
exports.getServiceRequestById = getServiceRequestById;
exports.createServiceRequest = createServiceRequest;
exports.getMedicalAppointmentScheduleOptions = getMedicalAppointmentScheduleOptions;
exports.submitMedicalAppointmentDecision = submitMedicalAppointmentDecision;
exports.markServiceRequestDone = markServiceRequestDone;
exports.rejectServiceRequest = rejectServiceRequest;
const promises_1 = require("fs/promises");
const mongoose_1 = __importDefault(require("mongoose"));
const gemini_service_1 = require("../../integrations/gemini/gemini.service");
const baileys_service_1 = require("../../integrations/baileys/baileys.service");
const appointment_schedule_1 = require("../../shared/appointment-schedule");
const messageFormatting_1 = require("../../shared/utils/messageFormatting");
const auth_scope_1 = require("../auth/auth.scope");
const bot_session_model_1 = require("../bot-sessions/bot-session.model");
const business_partner_model_1 = require("../business-partners/business-partner.model");
const flow_step_model_1 = require("../flow-steps/flow-step.model");
const media_cloudflare_service_1 = require("../media/media-cloudflare.service");
const message_model_1 = require("../messages/message.model");
const org_unit_model_1 = require("../org-units/org-unit.model");
const request_type_model_1 = require("../request-types/request-type.model");
const service_model_1 = require("../services/service.model");
const service_request_model_1 = require("./service-request.model");
const APPOINTMENT_REQUEST_TYPE_CODE = "MEDICAL_APPOINTMENT";
const CLIENT_CLINIC_LABEL = "PraxisKhalaf";
const CLINIC_APPOINTMENT_SCHEDULE = {
    timezone: "Europe/Berlin",
    daysAhead: 28,
    maxDateOptions: 14,
    weeklySchedule: {
        monday: [
            { start: "08:00", end: "13:00", intervalMinutes: 30 },
            { start: "15:00", end: "18:00", intervalMinutes: 30 },
        ],
        tuesday: [
            { start: "08:00", end: "13:00", intervalMinutes: 30 },
            { start: "15:00", end: "18:00", intervalMinutes: 30 },
        ],
        wednesday: [{ start: "08:00", end: "13:00", intervalMinutes: 30 }],
        thursday: [
            { start: "08:00", end: "13:00", intervalMinutes: 30 },
            { start: "15:00", end: "18:00", intervalMinutes: 30 },
        ],
        friday: [{ start: "08:00", end: "13:00", intervalMinutes: 30 }],
    },
};
const SNAPSHOT_LABEL_OVERRIDES = {
    CLINIC_WHATSAPP_INTAKE: {
        ar: "خدمة أونلاين",
        en: "Online Service",
        de: "Online-Service",
    },
    MEDICAL_APPOINTMENT: {
        ar: "موعد طبي",
        en: "Medical Appointment",
        de: "Medizinischer Termin",
    },
    MEDICAL_REQUESTS: {
        ar: "الخدمات الطبية",
        en: "Medical Requests",
        de: "Medizinische Anfragen",
    },
};
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isAppointmentRequestRecord(serviceRequest) {
    const requestTypeCode = serviceRequest.snapshots?.requestType?.code;
    if (isNonEmptyString(requestTypeCode)) {
        return requestTypeCode.trim().toUpperCase() === APPOINTMENT_REQUEST_TYPE_CODE;
    }
    return serviceRequest.requestData?.service_mode === "medical_appointment";
}
function getAppointmentFriendlyDateLabel(appointmentDate, language) {
    if (!isNonEmptyString(appointmentDate)) {
        return undefined;
    }
    return (0, appointment_schedule_1.formatAppointmentSlotForMessage)({
        date: appointmentDate,
        time: "08:00",
        language: language ?? "en",
        timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
    }).dateLabel;
}
function getAppointmentFriendlyTimeLabel(appointmentTime, language) {
    if (!isNonEmptyString(appointmentTime)) {
        return undefined;
    }
    return (0, appointment_schedule_1.formatAppointmentSlotForMessage)({
        date: "2026-01-01",
        time: appointmentTime,
        language: language ?? "en",
        timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
    }).timeLabel;
}
function buildApprovedAppointmentMessage(options) {
    const dateLabel = getAppointmentFriendlyDateLabel(options.appointmentDate, options.language);
    const timeLabel = getAppointmentFriendlyTimeLabel(options.appointmentTime, options.language);
    const clinicLabel = options.clinicLabel || CLIENT_CLINIC_LABEL;
    const normalizedLanguage = isNonEmptyString(options.language)
        ? options.language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return [
            "\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0637\u0644\u0628 \u0627\u0644\u0645\u0648\u0639\u062f.",
            dateLabel ? `\u0627\u0644\u062a\u0627\u0631\u064a\u062e: ${dateLabel}` : undefined,
            timeLabel ? `\u0627\u0644\u0648\u0642\u062a: ${timeLabel}` : undefined,
            `\u0627\u0644\u0639\u064a\u0627\u062f\u0629: ${clinicLabel}`,
            "\u0646\u062a\u0637\u0644\u0639 \u0644\u0631\u0624\u064a\u062a\u0643.",
        ]
            .filter(Boolean)
            .join("\n");
    }
    if (normalizedLanguage.startsWith("de")) {
        return [
            "Ihr Terminwunsch wurde best\u00e4tigt.",
            dateLabel ? `Datum: ${dateLabel}` : undefined,
            timeLabel ? `Uhrzeit: ${timeLabel}` : undefined,
            `Praxis: ${clinicLabel}`,
            "Wir freuen uns auf Ihren Besuch.",
        ]
            .filter(Boolean)
            .join("\n");
    }
    return [
        "Your appointment request has been approved.",
        dateLabel ? `Date: ${dateLabel}` : undefined,
        timeLabel ? `Time: ${timeLabel}` : undefined,
        `Clinic: ${clinicLabel}`,
        "We look forward to seeing you.",
    ]
        .filter(Boolean)
        .join("\n");
}
function buildAlternateAppointmentMessage(options) {
    const slot = (0, appointment_schedule_1.formatAppointmentSlotForMessage)({
        date: options.appointmentDate,
        time: options.appointmentTime,
        language: options.language ?? "en",
        timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
    });
    const clinicLabel = options.clinicLabel || CLIENT_CLINIC_LABEL;
    const normalizedLanguage = isNonEmptyString(options.language)
        ? options.language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            "\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u062d\u0627\u0644\u064a\u064b\u0627.",
            "\u064a\u0645\u0643\u0646\u0646\u0627 \u062a\u0642\u062f\u064a\u0645 \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u062a\u0627\u0644\u064a \u0644\u0643:",
            `\u0627\u0644\u062a\u0627\u0631\u064a\u062e: ${slot.dateLabel}`,
            `\u0627\u0644\u0648\u0642\u062a: ${slot.timeLabel}`,
            `\u0627\u0644\u0639\u064a\u0627\u062f\u0629: ${clinicLabel}`,
            "1 \u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0639\u062f",
            "2 \u0623\u0631\u064a\u062f \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0648\u0639\u062f \u0622\u062e\u0631",
            "\u0623\u0631\u0633\u0644: 1 \u0623\u0648 2",
        ].join("\n"));
    }
    if (normalizedLanguage.startsWith("de")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            "Der gew\u00e4hlte Termin ist aktuell nicht verf\u00fcgbar.",
            "Wir k\u00f6nnen Ihnen stattdessen diesen Termin anbieten:",
            `Datum: ${slot.dateLabel}`,
            `Uhrzeit: ${slot.timeLabel}`,
            `Praxis: ${clinicLabel}`,
            "1 Diesen Termin best\u00e4tigen",
            "2 Einen anderen Termin ausw\u00e4hlen",
            "Antworten Sie mit: 1 oder 2",
        ].join("\n"));
    }
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([
        "Your requested appointment is not available right now.",
        "We can offer you this appointment instead:",
        `Date: ${slot.dateLabel}`,
        `Time: ${slot.timeLabel}`,
        `Clinic: ${clinicLabel}`,
        "1 Confirm this appointment",
        "2 Choose another appointment",
        "Reply with: 1 or 2",
    ].join("\n"));
}
function buildGeneralRequestDoneMessage(options) {
    const normalizedLanguage = isNonEmptyString(options.language)
        ? options.language.trim().toLowerCase()
        : "en";
    const requestNumber = isNonEmptyString(options.requestNumber)
        ? options.requestNumber.trim()
        : undefined;
    if (normalizedLanguage.startsWith("ar")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            requestNumber ? `تم إنجاز طلبك رقم ${requestNumber}.` : "تم إنجاز طلبك.",
            "طلبك جاهز الآن.",
            "شكراً لتواصلك مع PraxisKhalaf.",
        ].join("\n"));
    }
    if (normalizedLanguage.startsWith("de")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            requestNumber
                ? `Ihre Anfrage ${requestNumber} wurde abgeschlossen.`
                : "Ihre Anfrage wurde abgeschlossen.",
            "Ihre Anfrage ist jetzt bereit.",
            "Vielen Dank, dass Sie PraxisKhalaf kontaktiert haben.",
        ].join("\n"));
    }
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([
        requestNumber
            ? `Your request ${requestNumber} has been completed.`
            : "Your request has been completed.",
        "Your request is now ready.",
        "Thank you for contacting PraxisKhalaf.",
    ].join("\n"));
}
function buildGeneralRequestRejectedMessage(options) {
    const normalizedLanguage = isNonEmptyString(options.language)
        ? options.language.trim().toLowerCase()
        : "en";
    const requestNumber = isNonEmptyString(options.requestNumber)
        ? options.requestNumber.trim()
        : undefined;
    if (normalizedLanguage.startsWith("ar")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            requestNumber
                ? `\u0646\u0623\u0633\u0641\u060c \u062a\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${requestNumber}.`
                : "\u0646\u0623\u0633\u0641\u060c \u062a\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628\u0643.",
            "\u0644\u0645 \u064a\u062a\u0645 \u0625\u062f\u062e\u0627\u0644 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646 \u0641\u064a \u0627\u0644\u0631\u0628\u0639 \u0627\u0644\u0633\u0646\u0648\u064a \u0627\u0644\u062d\u0627\u0644\u064a.",
            "\u064a\u0631\u062c\u0649 \u0632\u064a\u0627\u0631\u0629 \u0627\u0644\u0639\u064a\u0627\u062f\u0629 \u0645\u0639 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646.",
        ].join("\n"));
    }
    if (normalizedLanguage.startsWith("de")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            requestNumber
                ? `Leider wurde Ihre Anfrage ${requestNumber} abgelehnt.`
                : "Leider wurde Ihre Anfrage abgelehnt.",
            "Ihre Versicherungskarte wurde im aktuellen Quartal nicht eingelesen.",
            "Bitte kommen Sie mit Ihrer Versicherungskarte in die Praxis.",
        ].join("\n"));
    }
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([
        requestNumber
            ? `Sorry, your request ${requestNumber} was rejected.`
            : "Sorry, your request was rejected.",
        "Your insurance card has not been entered for the current quarter.",
        "Please visit the clinic with your insurance card.",
    ].join("\n"));
}
async function notifyGeneralRequestDone(options) {
    const session = options.session;
    if (!session ||
        !session.channelId ||
        !session.channelAccountId ||
        !isNonEmptyString(session.channelUserRef)) {
        return {
            sent: false,
            error: "No WhatsApp session/channel reference was available for this request.",
        };
    }
    const outboundText = buildGeneralRequestDoneMessage({
        language: options.serviceRequest.language ?? session.language,
        requestNumber: options.serviceRequestId.slice(-6),
    });
    try {
        await (0, baileys_service_1.sendBaileysTextMessage)(String(session.channelAccountId), session.channelUserRef.trim(), outboundText);
        await message_model_1.MessageModel.create({
            sessionId: session._id,
            channelId: new mongoose_1.default.Types.ObjectId(String(session.channelId)),
            channelAccountId: new mongoose_1.default.Types.ObjectId(String(session.channelAccountId)),
            direction: "outbound",
            actorType: "staff",
            actorId: options.authUser?.username,
            messageType: "text",
            content: {
                text: outboundText,
            },
            normalizedContent: {
                text: outboundText,
            },
            deliveryStatus: "sent",
            providerPayload: {
                source: "general_request_mark_done",
                requestId: options.serviceRequestId,
            },
            sentAt: new Date(),
            createdAt: new Date(),
        });
        return {
            sent: true,
            message: outboundText,
        };
    }
    catch (error) {
        return {
            sent: false,
            message: outboundText,
            error: error instanceof Error ? error.message : "Unknown notification error.",
        };
    }
}
async function notifyGeneralRequestRejected(options) {
    const session = options.session;
    if (!session ||
        !session.channelId ||
        !session.channelAccountId ||
        !isNonEmptyString(session.channelUserRef)) {
        return {
            sent: false,
            error: "No WhatsApp session/channel reference was available for this request.",
        };
    }
    const outboundText = buildGeneralRequestRejectedMessage({
        language: options.serviceRequest.language ?? session.language,
        requestNumber: options.serviceRequestId.slice(-6),
    });
    try {
        await (0, baileys_service_1.sendBaileysTextMessage)(String(session.channelAccountId), session.channelUserRef.trim(), outboundText);
        await message_model_1.MessageModel.create({
            sessionId: session._id,
            channelId: new mongoose_1.default.Types.ObjectId(String(session.channelId)),
            channelAccountId: new mongoose_1.default.Types.ObjectId(String(session.channelAccountId)),
            direction: "outbound",
            actorType: "staff",
            actorId: options.authUser?.username,
            messageType: "text",
            content: {
                text: outboundText,
            },
            normalizedContent: {
                text: outboundText,
            },
            deliveryStatus: "sent",
            providerPayload: {
                source: "general_request_rejected",
                requestId: options.serviceRequestId,
            },
            sentAt: new Date(),
            createdAt: new Date(),
        });
        return {
            sent: true,
            message: outboundText,
        };
    }
    catch (error) {
        return {
            sent: false,
            message: outboundText,
            error: error instanceof Error ? error.message : "Unknown notification error.",
        };
    }
}
function isAllowedAlternateAppointmentSlot(alternateDate, alternateTime) {
    const dateOptions = (0, appointment_schedule_1.generateAppointmentDateOptions)({
        schedule: CLINIC_APPOINTMENT_SCHEDULE,
        language: "en",
    });
    const allowedDate = dateOptions.find((option) => option.value === alternateDate);
    if (!allowedDate) {
        return false;
    }
    const timeOptions = (0, appointment_schedule_1.generateAppointmentTimeOptions)({
        schedule: CLINIC_APPOINTMENT_SCHEDULE,
        language: "en",
        selectedDate: alternateDate,
    });
    return timeOptions.some((option) => option.value === alternateTime);
}
function parseAppointmentDecisionBody(body) {
    const decision = isNonEmptyString(body.decision) ? body.decision.trim() : "";
    if (decision !== "approved" && decision !== "alternate_offer") {
        return {
            isValid: false,
            message: "Field 'decision' must be 'approved' or 'alternate_offer'.",
        };
    }
    const alternateDate = isNonEmptyString(body.alternateDate)
        ? body.alternateDate.trim()
        : undefined;
    const alternateTime = isNonEmptyString(body.alternateTime)
        ? body.alternateTime.trim()
        : undefined;
    if (decision === "alternate_offer") {
        if (!alternateDate || !alternateTime) {
            return {
                isValid: false,
                message: "alternateDate and alternateTime are required for an alternate offer.",
            };
        }
        if (!isAllowedAlternateAppointmentSlot(alternateDate, alternateTime)) {
            return {
                isValid: false,
                message: "The chosen alternate appointment slot is outside the configured opening hours.",
            };
        }
    }
    return {
        isValid: true,
        decision,
        alternateDate,
        alternateTime,
    };
}
async function getScopedServiceRequestSessionIds(authUser) {
    const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(authUser);
    if (!scopedFlow) {
        return null;
    }
    const sessionIds = await bot_session_model_1.BotSessionModel.find({ flowId: scopedFlow._id })
        .distinct("_id")
        .exec();
    return {
        scopedFlow,
        sessionIds,
    };
}
function parseDateField(value, fieldName, required) {
    if (value === undefined || value === null) {
        if (required) {
            return {
                isValid: false,
                message: `Field '${fieldName}' is required and must be a valid date.`,
            };
        }
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
    return { isValid: false, message: `Field '${fieldName}' must be a valid date.` };
}
function parseCreateBody(body) {
    if (body.orgUnitId !== undefined) {
        if (!isNonEmptyString(body.orgUnitId) || !mongoose_1.default.isValidObjectId(body.orgUnitId)) {
            return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
        }
    }
    if (body.businessPartnerId !== undefined) {
        if (!isNonEmptyString(body.businessPartnerId) ||
            !mongoose_1.default.isValidObjectId(body.businessPartnerId)) {
            return { isValid: false, message: "Field 'businessPartnerId' must be a valid ObjectId." };
        }
    }
    if (body.sessionId !== undefined) {
        if (!isNonEmptyString(body.sessionId) || !mongoose_1.default.isValidObjectId(body.sessionId)) {
            return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
        }
    }
    if (!isNonEmptyString(body.serviceId) || !mongoose_1.default.isValidObjectId(body.serviceId)) {
        return { isValid: false, message: "Field 'serviceId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.requestTypeId) || !mongoose_1.default.isValidObjectId(body.requestTypeId)) {
        return { isValid: false, message: "Field 'requestTypeId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.statusCode)) {
        return { isValid: false, message: "Field 'statusCode' is required." };
    }
    if (body.priorityCode !== undefined && !isNonEmptyString(body.priorityCode)) {
        return { isValid: false, message: "Field 'priorityCode' must be a non-empty string." };
    }
    if (body.sourceChannelCode !== undefined && !isNonEmptyString(body.sourceChannelCode)) {
        return { isValid: false, message: "Field 'sourceChannelCode' must be a non-empty string." };
    }
    if (body.language !== undefined && !isNonEmptyString(body.language)) {
        return { isValid: false, message: "Field 'language' must be a non-empty string." };
    }
    const submittedAtResult = parseDateField(body.submittedAt, "submittedAt", true);
    if (!submittedAtResult.isValid || !submittedAtResult.date) {
        return { isValid: false, message: submittedAtResult.message };
    }
    if (body.assignedToUserId !== undefined) {
        if (!isNonEmptyString(body.assignedToUserId) ||
            !mongoose_1.default.isValidObjectId(body.assignedToUserId)) {
            return { isValid: false, message: "Field 'assignedToUserId' must be a valid ObjectId." };
        }
    }
    if (!isPlainObject(body.requestData)) {
        return { isValid: false, message: "Field 'requestData' is required and must be an object." };
    }
    if (body.aiSummary !== undefined && !isPlainObject(body.aiSummary)) {
        return { isValid: false, message: "Field 'aiSummary' must be an object." };
    }
    if (body.resolutionData !== undefined && !isPlainObject(body.resolutionData)) {
        return { isValid: false, message: "Field 'resolutionData' must be an object." };
    }
    if (body.snapshots !== undefined && !isPlainObject(body.snapshots)) {
        return { isValid: false, message: "Field 'snapshots' must be an object." };
    }
    return {
        isValid: true,
        data: {
            orgUnitId: body.orgUnitId ? new mongoose_1.default.Types.ObjectId(body.orgUnitId) : undefined,
            businessPartnerId: body.businessPartnerId
                ? new mongoose_1.default.Types.ObjectId(body.businessPartnerId)
                : undefined,
            sessionId: body.sessionId ? new mongoose_1.default.Types.ObjectId(body.sessionId) : undefined,
            serviceId: new mongoose_1.default.Types.ObjectId(body.serviceId),
            requestTypeId: new mongoose_1.default.Types.ObjectId(body.requestTypeId),
            statusCode: body.statusCode.trim(),
            priorityCode: body.priorityCode?.trim(),
            sourceChannelCode: body.sourceChannelCode?.trim(),
            language: body.language?.trim(),
            submittedAt: submittedAtResult.date,
            assignedToUserId: body.assignedToUserId
                ? new mongoose_1.default.Types.ObjectId(body.assignedToUserId)
                : undefined,
            requestData: body.requestData,
            aiSummary: body.aiSummary,
            resolutionData: body.resolutionData,
            snapshots: body.snapshots,
        },
    };
}
function toIdString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
}
function resolveLocalizedText(localizedValue, preferredLanguage) {
    if (!isPlainObject(localizedValue)) {
        return undefined;
    }
    const requestedLanguage = preferredLanguage?.trim().toLowerCase();
    const baseLanguage = requestedLanguage?.split("-")[0];
    const candidateKeys = [requestedLanguage, baseLanguage, "en"].filter((value) => Boolean(value));
    for (const key of candidateKeys) {
        const candidate = localizedValue[key];
        if (isNonEmptyString(candidate)) {
            return candidate.trim();
        }
    }
    for (const value of Object.values(localizedValue)) {
        if (isNonEmptyString(value)) {
            return value.trim();
        }
    }
    return undefined;
}
function humanizeToken(value) {
    return value
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}
function looksLikeMachineCode(value) {
    return /^[A-Z0-9_]+$/.test(value.trim());
}
function formatLanguageLabel(value) {
    if (!isNonEmptyString(value)) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "ar") {
        return "Arabic";
    }
    if (normalized === "en") {
        return "English";
    }
    if (normalized === "de") {
        return "German";
    }
    return humanizeToken(normalized);
}
function formatDisplayDate(value) {
    if (!value) {
        return undefined;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    }
    return parsed.toLocaleDateString();
}
function formatClientValue(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }
    if (typeof value === "number") {
        return String(value);
    }
    if (value instanceof Date) {
        return formatDisplayDate(value);
    }
    if (typeof value === "string") {
        const normalized = value.trim();
        if (normalized.length === 0) {
            return undefined;
        }
        const lowerCased = normalized.toLowerCase();
        if (lowerCased === "yes" || lowerCased === "true") {
            return "Yes";
        }
        if (lowerCased === "no" || lowerCased === "false") {
            return "No";
        }
        if (lowerCased === "ar") {
            return "Arabic";
        }
        if (lowerCased === "en") {
            return "English";
        }
        if (lowerCased === "de") {
            return "German";
        }
        return normalized;
    }
    if (Array.isArray(value)) {
        const items = value.map(formatClientValue).filter((item) => Boolean(item && item.trim()));
        return items.length > 0 ? items.join(", ") : undefined;
    }
    if (isPlainObject(value)) {
        const items = Object.entries(value)
            .map(([key, nestedValue]) => {
            const formattedValue = formatClientValue(nestedValue);
            return formattedValue ? `${humanizeToken(key)}: ${formattedValue}` : undefined;
        })
            .filter((item) => Boolean(item));
        return items.length > 0 ? items.join(" | ") : undefined;
    }
    return undefined;
}
function getClientFieldLabel(key) {
    const normalizedKey = key.trim().toLowerCase();
    const friendlyLabels = {
        selected_language: "Selected language",
        selected_clinic: "Clinic",
        service_mode: "Service mode",
        registered_user: "Registered user",
        quarter_card_current: "Quarter card current",
        request_type_choice: "Request type",
        full_name: "Full name",
        appointment_full_name: "Full name",
        date_of_birth: "Date of birth",
        name_and_dob: "Name and date of birth",
        phone_number: "Phone number",
        appointment_phone: "Phone number",
        appointment_date: "Appointment date",
        appointment_time: "Appointment time",
        medication_and_dosage: "Medication and dosage",
        medical_specialty: "Medical specialty",
        symptoms: "Symptoms",
        sick_leave_period: "Sick note period",
        symptoms_since: "Symptoms since",
        sick_leave_until: "Sick leave until",
        medical_documents: "Medical documents",
    };
    return friendlyLabels[normalizedKey] ?? humanizeToken(normalizedKey);
}
function resolveSnapshotLabel(snapshot, preferredLanguage) {
    if (!snapshot) {
        return undefined;
    }
    const snapshotCode = isNonEmptyString(snapshot.code) ? snapshot.code.trim().toUpperCase() : undefined;
    const languageKey = isNonEmptyString(preferredLanguage)
        ? preferredLanguage.trim().toLowerCase().split("-")[0]
        : "en";
    const localizedLanguageKey = languageKey;
    const fallbackOverride = snapshotCode ? SNAPSHOT_LABEL_OVERRIDES[snapshotCode] : undefined;
    const localizedName = resolveLocalizedText(snapshot.name, preferredLanguage);
    if (localizedName &&
        !looksLikeMachineCode(localizedName) &&
        !/[?]{2,}|Ã|Ø|Ù/u.test(localizedName)) {
        return localizedName;
    }
    if (fallbackOverride) {
        return (fallbackOverride[localizedLanguageKey] ??
            fallbackOverride.en ??
            fallbackOverride.ar ??
            fallbackOverride.de);
    }
    return isNonEmptyString(snapshot.code) ? humanizeToken(snapshot.code) : undefined;
}
function resolveClientClinicLabel() {
    return CLIENT_CLINIC_LABEL;
}
function extractNameAndDob(value) {
    if (!isNonEmptyString(value)) {
        return {};
    }
    const [fullNamePart, dateOfBirthPart] = value
        .split(/\s+-\s+/, 2)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return {
        fullName: fullNamePart || undefined,
        dateOfBirth: dateOfBirthPart || undefined,
    };
}
function resolveChannelUserRefPhone(channelUserRef) {
    if (!isNonEmptyString(channelUserRef)) {
        return undefined;
    }
    const withoutSuffix = channelUserRef.trim().split("@")[0].replace(/:\d+$/, "");
    return /^\d{7,}$/.test(withoutSuffix) ? withoutSuffix : undefined;
}
function buildClientRequestReference(serviceRequestId) {
    return serviceRequestId.slice(-6);
}
async function getFlowChoiceMapsByDataKey(flowId) {
    const flowSteps = await flow_step_model_1.FlowStepModel.find({
        flowId,
        type: "choice",
        status: "active",
    })
        .select("stepConfig")
        .lean();
    const choiceMapsByDataKey = new Map();
    for (const flowStep of flowSteps) {
        const stepConfig = flowStep.stepConfig;
        if (!isPlainObject(stepConfig)) {
            continue;
        }
        const dataKey = stepConfig.dataKey;
        const choiceMap = stepConfig.choiceMap;
        if (!isNonEmptyString(dataKey) || !isPlainObject(choiceMap)) {
            continue;
        }
        const normalizedDataKey = dataKey.trim().toLowerCase();
        const existingChoiceMap = choiceMapsByDataKey.get(normalizedDataKey) ?? {};
        choiceMapsByDataKey.set(normalizedDataKey, {
            ...existingChoiceMap,
            ...choiceMap,
        });
    }
    return choiceMapsByDataKey;
}
function resolveChoiceMapValue(rawValue, choiceMap) {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }
    const normalizedRawValue = String(rawValue).trim();
    if (normalizedRawValue.length === 0) {
        return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(choiceMap, normalizedRawValue)) {
        return undefined;
    }
    return choiceMap[normalizedRawValue];
}
function normalizeSemanticValue(value) {
    if (isNonEmptyString(value)) {
        const normalized = value.trim();
        if (looksLikeMachineCode(normalized) || /^[a-z0-9_-]+$/i.test(normalized)) {
            return humanizeToken(normalized);
        }
        return normalized;
    }
    return value;
}
function applyChoiceMapValuesToRequestData(requestData, choiceMapsByDataKey) {
    if (!isPlainObject(requestData) || choiceMapsByDataKey.size === 0) {
        return requestData;
    }
    const nextRequestData = { ...requestData };
    for (const [dataKey, rawValue] of Object.entries(nextRequestData)) {
        const choiceMap = choiceMapsByDataKey.get(dataKey.toLowerCase());
        if (!choiceMap) {
            continue;
        }
        const mappedValue = resolveChoiceMapValue(rawValue, choiceMap);
        if (mappedValue === undefined) {
            continue;
        }
        nextRequestData[dataKey] = normalizeSemanticValue(mappedValue);
    }
    return nextRequestData;
}
function resolveClientPersonData(options) {
    const nameAndDob = extractNameAndDob(options.requestData?.name_and_dob);
    const fullName = options.businessPartner?.names?.fullName?.trim() ||
        (isNonEmptyString(options.requestData?.appointment_full_name)
            ? options.requestData?.appointment_full_name.trim()
            : undefined) ||
        (isNonEmptyString(options.requestData?.full_name)
            ? options.requestData?.full_name.trim()
            : undefined) ||
        nameAndDob.fullName;
    const phone = options.businessPartner?.contactInfo?.phone?.trim() ||
        (isNonEmptyString(options.requestData?.appointment_phone)
            ? options.requestData?.appointment_phone.trim()
            : undefined) ||
        (isNonEmptyString(options.requestData?.phone_number)
            ? options.requestData?.phone_number.trim()
            : undefined) ||
        resolveChannelUserRefPhone(options.session?.channelUserRef);
    const email = options.businessPartner?.contactInfo?.email?.trim() ||
        (isNonEmptyString(options.requestData?.email)
            ? options.requestData?.email.trim()
            : undefined);
    const dateOfBirth = formatDisplayDate(options.businessPartner?.personalInfo?.dateOfBirth) ||
        (isNonEmptyString(options.requestData?.date_of_birth)
            ? options.requestData?.date_of_birth.trim()
            : undefined) ||
        nameAndDob.dateOfBirth;
    const contactReference = isNonEmptyString(options.session?.channelUserRef)
        ? options.session?.channelUserRef.trim()
        : undefined;
    return {
        fullName,
        phone,
        email,
        dateOfBirth,
        contactReference: contactReference && contactReference !== phone ? contactReference : undefined,
    };
}
function buildClientRequestKindLabel(requestData, snapshots, preferredLanguage) {
    const snapshotRequestTypeLabel = resolveSnapshotLabel(snapshots?.requestType, preferredLanguage);
    if (requestData?.service_mode === "medical_appointment") {
        return snapshotRequestTypeLabel ?? "Medical Appointment";
    }
    if (isNonEmptyString(requestData?.request_type_choice)) {
        const normalizedChoice = requestData.request_type_choice.trim();
        if (/^\d+$/.test(normalizedChoice)) {
            return snapshotRequestTypeLabel ?? "Service request";
        }
        return humanizeToken(normalizedChoice);
    }
    return snapshotRequestTypeLabel;
}
function formatClientFieldValueByKey(fieldKey, fieldValue, language) {
    const normalizedKey = fieldKey.trim().toLowerCase();
    if (isNonEmptyString(fieldValue)) {
        const normalizedValue = fieldValue.trim();
        if (normalizedKey === "registered_user" ||
            normalizedKey === "quarter_card_current") {
            if (normalizedValue === "1") {
                return "Yes";
            }
            if (normalizedValue === "2") {
                return "No";
            }
        }
        if (normalizedKey === "appointment_date") {
            return getAppointmentFriendlyDateLabel(normalizedValue, language) ?? normalizedValue;
        }
        if (normalizedKey === "appointment_time") {
            return getAppointmentFriendlyTimeLabel(normalizedValue, language) ?? normalizedValue;
        }
        if (normalizedKey === "service_mode") {
            if (normalizedValue === "medical_appointment") {
                return "Medical appointment";
            }
            if (normalizedValue === "online_service") {
                return "Online service";
            }
        }
    }
    return formatClientValue(fieldValue);
}
function extractClientMediaUrl(fieldValue) {
    if (!isPlainObject(fieldValue)) {
        return undefined;
    }
    if (isNonEmptyString(fieldValue.url)) {
        return fieldValue.url.trim();
    }
    if (isNonEmptyString(fieldValue.mediaUrl)) {
        return fieldValue.mediaUrl.trim();
    }
    return undefined;
}
function extractClientMediaAssetId(fieldValue) {
    if (!isPlainObject(fieldValue)) {
        return undefined;
    }
    return isNonEmptyString(fieldValue.assetId) ? fieldValue.assetId.trim() : undefined;
}
function extractClientMediaMimeType(fieldValue) {
    if (!isPlainObject(fieldValue)) {
        return undefined;
    }
    return isNonEmptyString(fieldValue.mimeType) ? fieldValue.mimeType.trim() : undefined;
}
function extractClientMediaFileName(fieldValue) {
    if (!isPlainObject(fieldValue)) {
        return undefined;
    }
    return isNonEmptyString(fieldValue.fileName) ? fieldValue.fileName.trim() : undefined;
}
function formatClientMediaLabel(fieldValue) {
    if (!isPlainObject(fieldValue)) {
        return undefined;
    }
    const caption = isNonEmptyString(fieldValue.caption) ? fieldValue.caption.trim() : undefined;
    const fileName = isNonEmptyString(fieldValue.fileName) ? fieldValue.fileName.trim() : undefined;
    const mimeType = isNonEmptyString(fieldValue.mimeType) ? fieldValue.mimeType.trim().toLowerCase() : undefined;
    if (caption) {
        return caption;
    }
    if (fileName) {
        return fileName;
    }
    if (mimeType?.startsWith("image/")) {
        return "Attached image";
    }
    return "Attached file";
}
function extractClientMediaItems(fieldValue) {
    if (!Array.isArray(fieldValue)) {
        return [];
    }
    return fieldValue
        .map((entry) => {
        const mediaUrl = extractClientMediaUrl(entry);
        if (!mediaUrl) {
            return null;
        }
        return {
            value: formatClientMediaLabel(entry) ?? "Attached file",
            mediaUrl,
            mediaMimeType: extractClientMediaMimeType(entry),
            mediaFileName: extractClientMediaFileName(entry),
        };
    })
        .filter((entry) => entry !== null);
}
function inferMimeTypeFromFileName(fileName) {
    if (!isNonEmptyString(fileName)) {
        return undefined;
    }
    const normalizedName = fileName.trim().toLowerCase();
    if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
        return "image/jpeg";
    }
    if (normalizedName.endsWith(".png")) {
        return "image/png";
    }
    if (normalizedName.endsWith(".webp")) {
        return "image/webp";
    }
    if (normalizedName.endsWith(".gif")) {
        return "image/gif";
    }
    return undefined;
}
function isImageMimeType(value) {
    return isNonEmptyString(value) && value.trim().toLowerCase().startsWith("image/");
}
function normalizeClientOcrFields(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
        if (!isPlainObject(entry)) {
            return undefined;
        }
        const label = isNonEmptyString(entry.label) ? entry.label.trim() : undefined;
        const fieldValue = isNonEmptyString(entry.value) ? entry.value.trim() : undefined;
        if (!label || !fieldValue) {
            return undefined;
        }
        return {
            label,
            value: fieldValue,
        };
    })
        .filter((entry) => Boolean(entry));
}
function getCachedInsuranceCardOcrFields(options) {
    if (!isPlainObject(options.aiSummary)) {
        return undefined;
    }
    const cachedSummary = options.aiSummary.insuranceCardOcr;
    if (!isPlainObject(cachedSummary)) {
        return undefined;
    }
    const currentAssetId = extractClientMediaAssetId(options.fieldValue);
    const currentMediaUrl = extractClientMediaUrl(options.fieldValue);
    const cachedAssetId = isNonEmptyString(cachedSummary.sourceAssetId)
        ? cachedSummary.sourceAssetId.trim()
        : undefined;
    const cachedMediaUrl = isNonEmptyString(cachedSummary.sourceUrl)
        ? cachedSummary.sourceUrl.trim()
        : undefined;
    if (currentAssetId && cachedAssetId && currentAssetId !== cachedAssetId) {
        return undefined;
    }
    if (!currentAssetId && currentMediaUrl && cachedMediaUrl && currentMediaUrl !== cachedMediaUrl) {
        return undefined;
    }
    const cachedFields = normalizeClientOcrFields(cachedSummary.fields);
    return cachedFields.length > 0 ? cachedFields : undefined;
}
async function loadMediaBufferForOcr(fieldValue) {
    const explicitMimeType = extractClientMediaMimeType(fieldValue);
    const inferredMimeType = inferMimeTypeFromFileName(extractClientMediaFileName(fieldValue));
    const mediaUrl = extractClientMediaUrl(fieldValue);
    const assetId = extractClientMediaAssetId(fieldValue);
    if (assetId) {
        try {
            const filePath = await (0, media_cloudflare_service_1.resolveLocalMediaFilePath)(assetId);
            const fileBuffer = await (0, promises_1.readFile)(filePath);
            const mimeType = explicitMimeType ?? inferredMimeType ?? "image/jpeg";
            return isImageMimeType(mimeType)
                ? {
                    buffer: fileBuffer,
                    mimeType,
                }
                : null;
        }
        catch {
            return null;
        }
    }
    if (!mediaUrl) {
        return null;
    }
    try {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
            return null;
        }
        const responseMimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
        const mimeType = explicitMimeType ?? responseMimeType ?? inferredMimeType ?? "image/jpeg";
        if (!isImageMimeType(mimeType)) {
            return null;
        }
        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            mimeType,
        };
    }
    catch {
        return null;
    }
}
async function resolveInsuranceCardOcrFields(options) {
    const fieldKey = "insurance_card_image";
    const fieldValue = options.requestData?.[fieldKey];
    if (!fieldValue) {
        return undefined;
    }
    const cachedFields = getCachedInsuranceCardOcrFields({
        aiSummary: options.aiSummary,
        fieldValue,
    });
    if (cachedFields) {
        return cachedFields;
    }
    const mediaPayload = await loadMediaBufferForOcr(fieldValue);
    if (!mediaPayload) {
        return undefined;
    }
    try {
        const ocrResult = await (0, gemini_service_1.extractInsuranceCardFieldsFromImage)({
            imageBuffer: mediaPayload.buffer,
            mimeType: mediaPayload.mimeType,
        });
        if (ocrResult.fields.length === 0) {
            return undefined;
        }
        const nextAiSummary = isPlainObject(options.aiSummary)
            ? { ...options.aiSummary }
            : {};
        nextAiSummary.insuranceCardOcr = {
            sourceAssetId: extractClientMediaAssetId(fieldValue),
            sourceUrl: extractClientMediaUrl(fieldValue),
            model: ocrResult.model,
            rawText: ocrResult.rawText,
            fields: ocrResult.fields,
        };
        await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(options.serviceRequestId, {
            $set: {
                aiSummary: nextAiSummary,
            },
        }).exec();
        return ocrResult.fields;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown OCR error";
        console.warn(`[service-requests] insurance-card OCR skipped request=${options.serviceRequestId}: ${errorMessage}`);
        return undefined;
    }
}
function buildClientRequestDetails(options) {
    if (!isPlainObject(options.requestData)) {
        return [];
    }
    const hiddenKeys = new Set();
    if (options.person.fullName) {
        hiddenKeys.add("full_name");
        hiddenKeys.add("name_and_dob");
    }
    if (options.person.phone) {
        hiddenKeys.add("phone_number");
    }
    if (options.person.email) {
        hiddenKeys.add("email");
    }
    if (options.person.dateOfBirth) {
        hiddenKeys.add("date_of_birth");
        hiddenKeys.add("name_and_dob");
    }
    if (options.language) {
        hiddenKeys.add("selected_language");
    }
    if (options.clinicLabel) {
        hiddenKeys.add("selected_clinic");
    }
    if (options.requestKindLabel) {
        hiddenKeys.add("service_mode");
    }
    hiddenKeys.add("request_type_choice");
    return Object.entries(options.requestData)
        .filter(([key]) => !hiddenKeys.has(key))
        .reduce((details, [key, value]) => {
        const mediaItems = extractClientMediaItems(value);
        if (mediaItems.length > 0) {
            details.push({
                label: getClientFieldLabel(key),
                value: mediaItems.length === 1
                    ? mediaItems[0].value
                    : `${mediaItems.length} attached files`,
                mediaItems,
            });
            return details;
        }
        const mediaUrl = extractClientMediaUrl(value);
        if (mediaUrl) {
            details.push({
                label: getClientFieldLabel(key),
                value: formatClientMediaLabel(value) ?? "Attached image",
                mediaUrl,
                mediaMimeType: extractClientMediaMimeType(value),
                mediaFileName: extractClientMediaFileName(value),
                ocrFields: options.ocrFieldsByKey?.get(key.trim().toLowerCase()),
            });
            return details;
        }
        const formattedValue = formatClientFieldValueByKey(key, value, options.language);
        if (!formattedValue) {
            return details;
        }
        details.push({
            label: getClientFieldLabel(key),
            value: formattedValue,
        });
        return details;
    }, []);
}
function buildClientServiceRequestPayload(options) {
    const requestId = String(options.serviceRequest._id);
    const effectiveLanguage = options.serviceRequest.language ||
        options.session?.language ||
        options.businessPartner?.preferredLanguage;
    const semanticRequestData = applyChoiceMapValuesToRequestData(options.serviceRequest.requestData, options.choiceMapsByDataKey ?? new Map());
    const person = resolveClientPersonData({
        requestData: semanticRequestData,
        businessPartner: options.businessPartner,
        session: options.session,
    });
    const clinicLabel = resolveClientClinicLabel();
    const requestKindLabel = buildClientRequestKindLabel(semanticRequestData, options.serviceRequest.snapshots, effectiveLanguage);
    const serviceLabel = resolveSnapshotLabel(options.serviceRequest.snapshots?.service, effectiveLanguage);
    const requestTypeCode = isNonEmptyString(options.serviceRequest.snapshots?.requestType?.code)
        ? options.serviceRequest.snapshots?.requestType?.code.trim()
        : undefined;
    const serviceCode = isNonEmptyString(options.serviceRequest.snapshots?.service?.code)
        ? options.serviceRequest.snapshots?.service?.code.trim()
        : undefined;
    const isAppointment = isAppointmentRequestRecord({
        snapshots: options.serviceRequest.snapshots,
        requestData: semanticRequestData,
    });
    const resolutionData = isPlainObject(options.serviceRequest.resolutionData)
        ? options.serviceRequest.resolutionData
        : undefined;
    const storedAppointmentDate = isNonEmptyString(semanticRequestData?.appointment_date)
        ? semanticRequestData.appointment_date.trim()
        : undefined;
    const storedAppointmentTime = isNonEmptyString(semanticRequestData?.appointment_time)
        ? semanticRequestData.appointment_time.trim()
        : undefined;
    const approvedAppointmentDate = isNonEmptyString(resolutionData?.approvedDate)
        ? resolutionData.approvedDate.trim()
        : undefined;
    const approvedAppointmentTime = isNonEmptyString(resolutionData?.approvedTime)
        ? resolutionData.approvedTime.trim()
        : undefined;
    const shouldShowApprovedAppointment = ["approved", "done"].includes(options.serviceRequest.statusCode.trim().toLowerCase()) &&
        approvedAppointmentDate &&
        approvedAppointmentTime;
    const requestedAppointmentDate = shouldShowApprovedAppointment
        ? approvedAppointmentDate
        : storedAppointmentDate;
    const requestedAppointmentTime = shouldShowApprovedAppointment
        ? approvedAppointmentTime
        : storedAppointmentTime;
    const resolutionDecision = isNonEmptyString(resolutionData?.patientDecision) &&
        resolutionData.patientDecision.trim().toLowerCase() === "confirmed"
        ? "approved"
        : isNonEmptyString(resolutionData?.decision)
            ? resolutionData.decision.trim()
            : undefined;
    return {
        _id: requestId,
        reference: buildClientRequestReference(requestId),
        statusCode: options.serviceRequest.statusCode,
        priorityCode: options.serviceRequest.priorityCode,
        languageCode: effectiveLanguage,
        language: formatLanguageLabel(effectiveLanguage),
        submittedAt: options.serviceRequest.submittedAt,
        requestTypeLabel: requestKindLabel,
        requestTypeCode,
        serviceLabel,
        serviceCode,
        clinicLabel,
        isAppointment,
        requestedAppointmentDate,
        requestedAppointmentDateLabel: getAppointmentFriendlyDateLabel(requestedAppointmentDate, effectiveLanguage),
        requestedAppointmentTime,
        requestedAppointmentTimeLabel: getAppointmentFriendlyTimeLabel(requestedAppointmentTime, effectiveLanguage),
        resolutionData: resolutionData
            ? {
                decision: resolutionDecision,
                alternateDate: isNonEmptyString(resolutionData.alternateDate)
                    ? resolutionData.alternateDate.trim()
                    : undefined,
                alternateDateLabel: getAppointmentFriendlyDateLabel(isNonEmptyString(resolutionData.alternateDate)
                    ? resolutionData.alternateDate.trim()
                    : undefined, effectiveLanguage),
                alternateTime: isNonEmptyString(resolutionData.alternateTime)
                    ? resolutionData.alternateTime.trim()
                    : undefined,
                alternateTimeLabel: getAppointmentFriendlyTimeLabel(isNonEmptyString(resolutionData.alternateTime)
                    ? resolutionData.alternateTime.trim()
                    : undefined, effectiveLanguage),
                approvedDate: approvedAppointmentDate,
                approvedDateLabel: getAppointmentFriendlyDateLabel(approvedAppointmentDate, effectiveLanguage),
                approvedTime: approvedAppointmentTime,
                approvedTimeLabel: getAppointmentFriendlyTimeLabel(approvedAppointmentTime, effectiveLanguage),
                patientDecision: isNonEmptyString(resolutionData.patientDecision)
                    ? resolutionData.patientDecision.trim()
                    : undefined,
                patientRespondedAt: formatDisplayDate(isNonEmptyString(resolutionData.patientRespondedAt)
                    ? resolutionData.patientRespondedAt.trim()
                    : undefined),
                awaitingPatientDecision: typeof resolutionData.awaitingPatientDecision === "boolean"
                    ? resolutionData.awaitingPatientDecision
                    : undefined,
                decidedAt: formatDisplayDate(isNonEmptyString(resolutionData.decidedAt)
                    ? resolutionData.decidedAt.trim()
                    : undefined),
            }
            : undefined,
        person,
        details: buildClientRequestDetails({
            requestData: semanticRequestData,
            language: effectiveLanguage,
            person,
            clinicLabel,
            requestKindLabel,
            ocrFieldsByKey: options.ocrFieldsByKey,
        }),
    };
}
async function getScopedAppointmentRequestContext(options) {
    if ((0, auth_scope_1.isClientUserRole)(options.authUser?.role)) {
        const scopedSessionState = await getScopedServiceRequestSessionIds(options.authUser);
        if (!scopedSessionState) {
            return null;
        }
        const scopedRequest = await service_request_model_1.ServiceRequestModel.findOne({
            _id: options.id,
            sessionId: { $in: scopedSessionState.sessionIds },
        })
            .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
            .lean();
        if (!scopedRequest) {
            return {
                serviceRequest: null,
                session: null,
            };
        }
        const scopedSession = scopedRequest.sessionId
            ? await bot_session_model_1.BotSessionModel.findById(scopedRequest.sessionId)
                .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
                .lean()
            : null;
        return {
            serviceRequest: scopedRequest,
            session: scopedSession,
        };
    }
    const serviceRequest = await service_request_model_1.ServiceRequestModel.findById(options.id)
        .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
        .lean();
    if (!serviceRequest) {
        return {
            serviceRequest: null,
            session: null,
        };
    }
    const session = serviceRequest.sessionId
        ? await bot_session_model_1.BotSessionModel.findById(serviceRequest.sessionId)
            .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
            .lean()
        : null;
    return {
        serviceRequest,
        session,
    };
}
async function getServiceRequests(req, res, next) {
    try {
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
            if (!scopedSessionState) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            const serviceRequests = await service_request_model_1.ServiceRequestModel.find({
                sessionId: { $in: scopedSessionState.sessionIds },
            })
                .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
                .sort({ createdAt: -1 })
                .lean();
            const sessionIds = serviceRequests
                .map((serviceRequest) => toIdString(serviceRequest.sessionId))
                .filter((value) => Boolean(value));
            const sessions = sessionIds.length
                ? await bot_session_model_1.BotSessionModel.find({ _id: { $in: sessionIds } })
                    .select("_id businessPartnerId flowId channelUserRef language")
                    .lean()
                : [];
            const sessionsById = new Map(sessions.map((session) => [String(session._id), session]));
            const businessPartnerIds = Array.from(new Set([
                ...serviceRequests.map((serviceRequest) => toIdString(serviceRequest.businessPartnerId)),
                ...sessions.map((session) => toIdString(session.businessPartnerId)),
            ].filter((value) => Boolean(value))));
            const businessPartners = businessPartnerIds.length
                ? await business_partner_model_1.BusinessPartnerModel.find({ _id: { $in: businessPartnerIds } })
                    .select("names.fullName contactInfo.phone contactInfo.email personalInfo.dateOfBirth preferredLanguage")
                    .lean()
                : [];
            const businessPartnersById = new Map(businessPartners.map((businessPartner) => [String(businessPartner._id), businessPartner]));
            const choiceMapsByDataKey = await getFlowChoiceMapsByDataKey(scopedSessionState.scopedFlow._id);
            const formattedServiceRequests = serviceRequests.map((serviceRequest) => {
                const session = serviceRequest.sessionId
                    ? sessionsById.get(String(serviceRequest.sessionId))
                    : undefined;
                const businessPartnerId = toIdString(serviceRequest.businessPartnerId) ?? toIdString(session?.businessPartnerId);
                const businessPartner = businessPartnerId
                    ? businessPartnersById.get(businessPartnerId)
                    : undefined;
                return buildClientServiceRequestPayload({
                    serviceRequest,
                    session,
                    businessPartner,
                    choiceMapsByDataKey,
                });
            });
            res.status(200).json({
                success: true,
                data: formattedServiceRequests,
            });
            return;
        }
        const serviceRequests = await service_request_model_1.ServiceRequestModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: serviceRequests,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getServiceRequestById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service request id.",
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
            if (!scopedSessionState) {
                res.status(403).json({
                    success: false,
                    message: "Client flow scope is not configured.",
                });
                return;
            }
            const serviceRequest = await service_request_model_1.ServiceRequestModel.findOne({
                _id: id,
                sessionId: { $in: scopedSessionState.sessionIds },
            })
                .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots aiSummary resolutionData")
                .lean();
            if (!serviceRequest) {
                res.status(404).json({
                    success: false,
                    message: "Service request not found.",
                });
                return;
            }
            const session = serviceRequest.sessionId
                ? await bot_session_model_1.BotSessionModel.findById(serviceRequest.sessionId)
                    .select("_id businessPartnerId flowId channelUserRef language")
                    .lean()
                : null;
            const businessPartnerId = toIdString(serviceRequest.businessPartnerId) ?? toIdString(session?.businessPartnerId);
            const businessPartner = businessPartnerId
                ? await business_partner_model_1.BusinessPartnerModel.findById(businessPartnerId)
                    .select("names.fullName contactInfo.phone contactInfo.email personalInfo.dateOfBirth preferredLanguage")
                    .lean()
                : null;
            const choiceMapsByDataKey = await getFlowChoiceMapsByDataKey(scopedSessionState.scopedFlow._id);
            const insuranceCardOcrFields = await resolveInsuranceCardOcrFields({
                serviceRequestId: String(serviceRequest._id),
                requestData: serviceRequest.requestData,
                aiSummary: serviceRequest.aiSummary,
            });
            const ocrFieldsByKey = new Map();
            if (insuranceCardOcrFields && insuranceCardOcrFields.length > 0) {
                ocrFieldsByKey.set("insurance_card_image", insuranceCardOcrFields);
            }
            res.status(200).json({
                success: true,
                data: buildClientServiceRequestPayload({
                    serviceRequest,
                    session,
                    businessPartner,
                    choiceMapsByDataKey,
                    ocrFieldsByKey,
                }),
            });
            return;
        }
        const serviceRequest = await service_request_model_1.ServiceRequestModel.findById(id).lean();
        if (!serviceRequest) {
            res.status(404).json({
                success: false,
                message: "Service request not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: serviceRequest,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createServiceRequest(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const service = await service_model_1.ServiceModel.findById(parsed.data.serviceId).lean();
        if (!service) {
            res.status(400).json({
                success: false,
                message: "serviceId does not reference an existing service.",
            });
            return;
        }
        const requestType = await request_type_model_1.RequestTypeModel.findById(parsed.data.requestTypeId).lean();
        if (!requestType) {
            res.status(400).json({
                success: false,
                message: "requestTypeId does not reference an existing request type.",
            });
            return;
        }
        let orgUnitSnapshot;
        if (parsed.data.orgUnitId) {
            const orgUnit = await org_unit_model_1.OrgUnitModel.findById(parsed.data.orgUnitId).lean();
            if (!orgUnit) {
                res.status(400).json({
                    success: false,
                    message: "orgUnitId does not reference an existing org unit.",
                });
                return;
            }
            orgUnitSnapshot = {
                code: orgUnit.code,
                name: orgUnit.name
                    ? {
                        ar: orgUnit.name.ar,
                        en: orgUnit.name.en,
                        de: orgUnit.name.de,
                    }
                    : undefined,
            };
        }
        if (parsed.data.businessPartnerId) {
            const businessPartnerExists = await business_partner_model_1.BusinessPartnerModel.exists({
                _id: parsed.data.businessPartnerId,
            });
            if (!businessPartnerExists) {
                res.status(400).json({
                    success: false,
                    message: "businessPartnerId does not reference an existing business partner.",
                });
                return;
            }
        }
        if (parsed.data.sessionId) {
            const sessionExists = await bot_session_model_1.BotSessionModel.exists({ _id: parsed.data.sessionId });
            if (!sessionExists) {
                res.status(400).json({
                    success: false,
                    message: "sessionId does not reference an existing bot session.",
                });
                return;
            }
        }
        const snapshots = {
            ...(parsed.data.snapshots ?? {}),
            service: {
                code: service.code,
                name: service.name
                    ? {
                        ar: service.name.ar,
                        en: service.name.en,
                        de: service.name.de,
                    }
                    : undefined,
            },
            requestType: {
                code: requestType.code,
                name: requestType.name
                    ? {
                        ar: requestType.name.ar,
                        en: requestType.name.en,
                        de: requestType.name.de,
                    }
                    : undefined,
            },
            orgUnit: orgUnitSnapshot ?? parsed.data.snapshots?.orgUnit,
        };
        const serviceRequest = await service_request_model_1.ServiceRequestModel.create({
            ...parsed.data,
            snapshots,
        });
        res.status(201).json({
            success: true,
            data: serviceRequest,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getMedicalAppointmentScheduleOptions(req, res, next) {
    try {
        const language = isNonEmptyString(req.query.language) ? req.query.language.trim() : "en";
        const selectedDate = isNonEmptyString(req.query.selectedDate)
            ? req.query.selectedDate.trim()
            : undefined;
        const dateOptions = (0, appointment_schedule_1.generateAppointmentDateOptions)({
            schedule: CLINIC_APPOINTMENT_SCHEDULE,
            language,
        });
        const timeOptions = selectedDate
            ? (0, appointment_schedule_1.generateAppointmentTimeOptions)({
                schedule: CLINIC_APPOINTMENT_SCHEDULE,
                language,
                selectedDate,
            })
            : [];
        res.status(200).json({
            success: true,
            data: {
                dateOptions,
                timeOptions,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function submitMedicalAppointmentDecision(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service request id.",
            });
            return;
        }
        const parsedDecision = parseAppointmentDecisionBody(req.body);
        if (!parsedDecision.isValid || !parsedDecision.decision) {
            res.status(400).json({
                success: false,
                message: parsedDecision.message,
            });
            return;
        }
        const scopedContext = await getScopedAppointmentRequestContext({
            id,
            authUser: req.authUser,
        });
        if (!scopedContext) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        const { serviceRequest, session } = scopedContext;
        if (!serviceRequest) {
            res.status(404).json({
                success: false,
                message: "Appointment request not found.",
            });
            return;
        }
        if (!isAppointmentRequestRecord(serviceRequest)) {
            res.status(400).json({
                success: false,
                message: "This request is not a medical appointment request.",
            });
            return;
        }
        if (!session || !session.channelAccountId || !isNonEmptyString(session.channelUserRef)) {
            res.status(400).json({
                success: false,
                message: "The appointment request is missing session channel delivery details.",
            });
            return;
        }
        const requestData = isPlainObject(serviceRequest.requestData)
            ? serviceRequest.requestData
            : {};
        const requestedDate = isNonEmptyString(requestData.appointment_date)
            ? requestData.appointment_date.trim()
            : undefined;
        const requestedTime = isNonEmptyString(requestData.appointment_time)
            ? requestData.appointment_time.trim()
            : undefined;
        const language = serviceRequest.language || session.language || "en";
        const clinicLabel = resolveClientClinicLabel();
        let nextStatusCode = "approved";
        let outboundText = "";
        if (parsedDecision.decision === "approved") {
            if (!requestedDate || !requestedTime) {
                res.status(400).json({
                    success: false,
                    message: "The requested appointment slot is missing from this request and cannot be approved directly.",
                });
                return;
            }
            outboundText = buildApprovedAppointmentMessage({
                language,
                clinicLabel,
                appointmentDate: requestedDate,
                appointmentTime: requestedTime,
            });
        }
        else {
            nextStatusCode = "alternate_offered";
            outboundText = buildAlternateAppointmentMessage({
                language,
                clinicLabel,
                appointmentDate: parsedDecision.alternateDate,
                appointmentTime: parsedDecision.alternateTime,
            });
        }
        await (0, baileys_service_1.sendBaileysTextMessage)(String(session.channelAccountId), session.channelUserRef.trim(), outboundText);
        if (!session.channelId || !mongoose_1.default.isValidObjectId(session.channelId)) {
            res.status(500).json({
                success: false,
                message: "Linked session is missing a valid channel reference.",
            });
            return;
        }
        await message_model_1.MessageModel.create({
            sessionId: session._id,
            channelId: new mongoose_1.default.Types.ObjectId(String(session.channelId)),
            channelAccountId: session.channelAccountId,
            direction: "outbound",
            actorType: "staff",
            actorId: req.authUser?.username,
            messageType: "text",
            content: {
                text: outboundText,
            },
            normalizedContent: {
                text: outboundText,
            },
            deliveryStatus: "sent",
            providerPayload: {
                source: "appointment_dashboard_decision",
                requestId: id,
                decision: parsedDecision.decision,
            },
            sentAt: new Date(),
            createdAt: new Date(),
        });
        const resolutionData = {
            decision: parsedDecision.decision,
            decidedAt: new Date().toISOString(),
            decidedByUsername: req.authUser?.username,
            decidedByDisplayName: req.authUser?.displayName,
            requestedDate,
            requestedTime,
            alternateDate: parsedDecision.decision === "alternate_offer" ? parsedDecision.alternateDate : undefined,
            alternateTime: parsedDecision.decision === "alternate_offer" ? parsedDecision.alternateTime : undefined,
            deliveredMessage: outboundText,
            awaitingPatientDecision: parsedDecision.decision === "alternate_offer",
        };
        await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(id, {
            $set: {
                statusCode: nextStatusCode,
                resolutionData,
            },
        }).exec();
        res.status(200).json({
            success: true,
            data: {
                requestId: id,
                statusCode: nextStatusCode,
                resolutionData,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function markServiceRequestDone(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service request id.",
            });
            return;
        }
        if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            res.status(403).json({
                success: false,
                message: "Only client workspace users can mark requests as done from this endpoint.",
            });
            return;
        }
        const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
        if (!scopedSessionState) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        const serviceRequest = await service_request_model_1.ServiceRequestModel.findOne({
            _id: id,
            sessionId: { $in: scopedSessionState.sessionIds },
        })
            .select("_id businessPartnerId sessionId statusCode language requestData snapshots resolutionData")
            .lean();
        if (!serviceRequest) {
            res.status(404).json({
                success: false,
                message: "Service request not found.",
            });
            return;
        }
        if (serviceRequest.statusCode.trim().toLowerCase() === "done") {
            res.status(200).json({
                success: true,
                data: {
                    requestId: id,
                    statusCode: "done",
                },
            });
            return;
        }
        if (serviceRequest.statusCode.trim().toLowerCase() === "rejected") {
            res.status(409).json({
                success: false,
                message: "Rejected requests cannot be marked as done.",
            });
            return;
        }
        if (isAppointmentRequestRecord(serviceRequest)) {
            res.status(400).json({
                success: false,
                message: "Appointment requests use the medical appointment workflow.",
            });
            return;
        }
        const session = serviceRequest.sessionId
            ? await bot_session_model_1.BotSessionModel.findById(serviceRequest.sessionId)
                .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
                .lean()
            : null;
        const notificationResult = await notifyGeneralRequestDone({
            serviceRequestId: id,
            serviceRequest,
            session,
            authUser: req.authUser,
        });
        const nextResolutionData = {
            ...(isPlainObject(serviceRequest.resolutionData) ? serviceRequest.resolutionData : {}),
            doneAt: new Date().toISOString(),
            doneByUsername: req.authUser?.username,
            doneByDisplayName: req.authUser?.displayName,
            doneNotification: {
                sent: notificationResult.sent,
                sentAt: notificationResult.sent ? new Date().toISOString() : undefined,
                message: notificationResult.message,
                error: notificationResult.error,
            },
        };
        await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(id, {
            $set: {
                statusCode: "done",
                resolutionData: nextResolutionData,
            },
        }).exec();
        res.status(200).json({
            success: true,
            data: {
                requestId: id,
                statusCode: "done",
                resolutionData: nextResolutionData,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function rejectServiceRequest(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service request id.",
            });
            return;
        }
        if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            res.status(403).json({
                success: false,
                message: "Only client workspace users can reject requests from this endpoint.",
            });
            return;
        }
        const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
        if (!scopedSessionState) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        const serviceRequest = await service_request_model_1.ServiceRequestModel.findOne({
            _id: id,
            sessionId: { $in: scopedSessionState.sessionIds },
        })
            .select("_id businessPartnerId sessionId statusCode language requestData snapshots resolutionData")
            .lean();
        if (!serviceRequest) {
            res.status(404).json({
                success: false,
                message: "Service request not found.",
            });
            return;
        }
        const normalizedStatus = serviceRequest.statusCode.trim().toLowerCase();
        if (normalizedStatus === "rejected") {
            res.status(200).json({
                success: true,
                data: {
                    requestId: id,
                    statusCode: "rejected",
                },
            });
            return;
        }
        if (normalizedStatus === "done") {
            res.status(409).json({
                success: false,
                message: "Completed requests cannot be rejected.",
            });
            return;
        }
        if (isAppointmentRequestRecord(serviceRequest)) {
            res.status(400).json({
                success: false,
                message: "Appointment requests use the medical appointment workflow.",
            });
            return;
        }
        const session = serviceRequest.sessionId
            ? await bot_session_model_1.BotSessionModel.findById(serviceRequest.sessionId)
                .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
                .lean()
            : null;
        const notificationResult = await notifyGeneralRequestRejected({
            serviceRequestId: id,
            serviceRequest,
            session,
            authUser: req.authUser,
        });
        const nextResolutionData = {
            ...(isPlainObject(serviceRequest.resolutionData) ? serviceRequest.resolutionData : {}),
            rejectedAt: new Date().toISOString(),
            rejectedByUsername: req.authUser?.username,
            rejectedByDisplayName: req.authUser?.displayName,
            rejectionReasonCode: "insurance_card_not_scanned_current_quarter",
            rejectedNotification: {
                sent: notificationResult.sent,
                sentAt: notificationResult.sent ? new Date().toISOString() : undefined,
                message: notificationResult.message,
                error: notificationResult.error,
            },
        };
        await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(id, {
            $set: {
                statusCode: "rejected",
                resolutionData: nextResolutionData,
            },
        }).exec();
        res.status(200).json({
            success: true,
            data: {
                requestId: id,
                statusCode: "rejected",
                resolutionData: nextResolutionData,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
