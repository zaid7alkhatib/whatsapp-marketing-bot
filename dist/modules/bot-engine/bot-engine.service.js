"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSession = startSession;
exports.processMessage = processMessage;
exports.isBotEngineError = isBotEngineError;
const mongoose_1 = __importDefault(require("mongoose"));
const promises_1 = require("fs/promises");
const gemini_service_1 = require("../../integrations/gemini/gemini.service");
const appointment_schedule_1 = require("../../shared/appointment-schedule");
const messageFormatting_1 = require("../../shared/utils/messageFormatting");
const bot_session_model_1 = require("../bot-sessions/bot-session.model");
const business_partner_model_1 = require("../business-partners/business-partner.model");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const channel_model_1 = require("../channels/channel.model");
const content_template_model_1 = require("../content-templates/content-template.model");
const flow_step_model_1 = require("../flow-steps/flow-step.model");
const flow_model_1 = require("../flows/flow.model");
const message_model_1 = require("../messages/message.model");
const org_unit_model_1 = require("../org-units/org-unit.model");
const request_type_model_1 = require("../request-types/request-type.model");
const session_step_response_model_1 = require("../session-step-responses/session-step-response.model");
const service_request_model_1 = require("../service-requests/service-request.model");
const service_model_1 = require("../services/service.model");
const media_cloudflare_service_1 = require("../media/media-cloudflare.service");
class BotEngineError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "BotEngineError";
        this.statusCode = statusCode;
    }
}
const MAX_MESSAGE_AUTO_ADVANCE_DEPTH = 50;
function buildServiceRequestReference(serviceRequestId) {
    return serviceRequestId.slice(-6);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasUsableValue(value) {
    if (value === undefined || value === null) {
        return false;
    }
    if (typeof value === "string") {
        return value.trim().length > 0;
    }
    return true;
}
function parseObjectId(value, fieldName, required) {
    if (value === undefined || value === null) {
        if (required) {
            throw new BotEngineError(`Field '${fieldName}' is required.`);
        }
        return undefined;
    }
    if (!isNonEmptyString(value) || !mongoose_1.default.isValidObjectId(value)) {
        throw new BotEngineError(`Field '${fieldName}' must be a valid ObjectId.`);
    }
    return new mongoose_1.default.Types.ObjectId(value);
}
function normalizeStepCode(stepCode) {
    return stepCode.trim().toUpperCase();
}
function isRestartCommand(inputText) {
    if (!isNonEmptyString(inputText)) {
        return false;
    }
    const normalizedText = inputText.trim().toLowerCase();
    return normalizedText === "restart" || normalizedText === "/restart";
}
function isBackCommand(inputText) {
    if (!isNonEmptyString(inputText)) {
        return false;
    }
    return inputText.trim() === "0";
}
function isInteractiveStepType(stepType) {
    return stepType === "choice" || stepType === "input_text";
}
function getBackOptionLine(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "0 \u0631\u062c\u0648\u0639";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "0 Zur\u00fcck";
    }
    return "0 Back";
}
function getBackReplyHint(language, stepType) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (stepType === "choice") {
        if (normalizedLanguage.startsWith("ar")) {
            return "\u0623\u0631\u0633\u0644: 0 \u0644\u0644\u0631\u062c\u0648\u0639 \u0623\u0648 \u0627\u062e\u062a\u0631 \u0623\u062d\u062f \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0623\u0639\u0644\u0627\u0647";
        }
        if (normalizedLanguage.startsWith("de")) {
            return "Antworten Sie mit: 0 zum Zur\u00fcckgehen oder w\u00e4hlen Sie eine der Optionen oben";
        }
        return "Reply with: 0 to go back, or choose one of the options above";
    }
    if (normalizedLanguage.startsWith("ar")) {
        return "\u0623\u0631\u0633\u0644: 0 \u0644\u0644\u0631\u062c\u0648\u0639";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Antworten Sie mit: 0 zum Zur\u00fcckgehen";
    }
    return "Reply with: 0 to go back";
}
function getAlreadyAtFirstStepReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u0623\u0646\u062a \u0628\u0627\u0644\u0641\u0639\u0644 \u0641\u064a \u0623\u0648\u0644 \u062e\u0637\u0648\u0629.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Sie befinden sich bereits beim ersten Schritt.";
    }
    return "You are already at the first step.";
}
function getInvalidChoiceReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0631\u0642\u0645 \u0635\u062d\u064a\u062d \u0645\u0646 \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Bitte w\u00e4hlen Sie eine g\u00fcltige Nummer aus den angezeigten Optionen.";
    }
    return "Please choose a valid number from the listed options.";
}
function getMediaAttachmentRequiredReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "يرجى إرسال الملف أو الصورة في هذه الخطوة.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Bitte senden Sie in diesem Schritt eine Datei oder ein Bild.";
    }
    return "Please upload a file or image for this step.";
}
function isMultiMediaCollectionStep(step, stepDataKey) {
    if (step.type !== "input_text" || !extractStepConfigBoolean(step, "mediaOnly")) {
        return false;
    }
    if (extractStepConfigBoolean(step, "allowMultipleMedia")) {
        return true;
    }
    return isNonEmptyString(stepDataKey) && stepDataKey.trim().toLowerCase() === "medical_documents";
}
function getCollectedMediaItems(collectedData, stepDataKey) {
    if (!isNonEmptyString(stepDataKey) || !isPlainObject(collectedData)) {
        return [];
    }
    const currentValue = collectedData[stepDataKey];
    if (!Array.isArray(currentValue)) {
        return [];
    }
    return currentValue.filter(isPlainObject);
}
function isMultiMediaUploadFinishCommand(inputText) {
    if (!isNonEmptyString(inputText)) {
        return false;
    }
    const normalized = inputText.trim().toLowerCase();
    return (normalized === "done" ||
        normalized === "finish" ||
        normalized === "finished" ||
        normalized === "complete" ||
        normalized === "\u062a\u0645" ||
        normalized === "\u0627\u0646\u062a\u0647\u064a\u062a" ||
        normalized === "\u0627\u0646\u062a\u0647\u0649" ||
        normalized === "fertig");
}
function getMultiMediaUploadContinueReply(language, uploadedCount) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            uploadedCount > 1
                ? `\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 ${uploadedCount} \u0645\u0644\u0641\u0627\u062a \u0628\u0646\u062c\u0627\u062d.`
                : "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0645\u0644\u0641 \u0628\u0646\u062c\u0627\u062d.",
            "\u0625\u0630\u0627 \u0623\u0631\u062f\u062a \u0625\u0631\u0633\u0627\u0644 \u0645\u0644\u0641 \u0622\u062e\u0631 \u0641\u0623\u0631\u0633\u0644\u0647 \u0627\u0644\u0622\u0646.",
            "\u0648\u0625\u0630\u0627 \u0627\u0646\u062a\u0647\u064a\u062a \u0641\u0623\u0631\u0633\u0644: \u062a\u0645",
            getBackReplyHint(language, "input_text"),
        ].join("\n"));
    }
    if (normalizedLanguage.startsWith("de")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            uploadedCount > 1
                ? `${uploadedCount} Dateien wurden erfolgreich empfangen.`
                : "Die Datei wurde erfolgreich empfangen.",
            "Wenn Sie eine weitere Datei senden m\u00f6chten, senden Sie sie jetzt.",
            "Wenn Sie fertig sind, antworten Sie mit: fertig",
            getBackReplyHint(language, "input_text"),
        ].join("\n"));
    }
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([
        uploadedCount > 1
            ? `${uploadedCount} files were received successfully.`
            : "The file was received successfully.",
        "If you want to send another file, send it now.",
        "When you are finished, reply with: done",
        getBackReplyHint(language, "input_text"),
    ].join("\n"));
}
function getMultiMediaUploadMissingFilesReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u064a\u0631\u062c\u0649 \u0625\u0631\u0633\u0627\u0644 \u0645\u0644\u0641 \u0648\u0627\u062d\u062f \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0623\u0648\u0644\u0627\u064b\u060c \u0623\u0648 \u0627\u0631\u062c\u0639 \u0648\u0627\u062e\u062a\u0631 \u0639\u062f\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Bitte senden Sie zuerst mindestens eine Datei oder gehen Sie zur\u00fcck und w\u00e4hlen Sie aus, dass Sie nichts hochladen m\u00f6chten.";
    }
    return "Please send at least one file first, or go back and choose not to upload documents.";
}
function isAlternateOfferConfirmCommand(inputText) {
    if (!isNonEmptyString(inputText)) {
        return false;
    }
    const normalized = inputText.trim().toLowerCase();
    return normalized === "1" || normalized === "yes" || normalized === "y" || normalized === "نعم" || normalized === "ja";
}
function isAlternateOfferRechooseCommand(inputText) {
    if (!isNonEmptyString(inputText)) {
        return false;
    }
    const normalized = inputText.trim().toLowerCase();
    return normalized === "2" || normalized === "no" || normalized === "n" || normalized === "لا" || normalized === "nein";
}
function getClientClinicLabel() {
    return "PraxisKhalaf";
}
function getAppointmentMessageTimezone() {
    return "Europe/Berlin";
}
function getAppointmentFriendlyDateLabel(appointmentDate, language) {
    if (!isNonEmptyString(appointmentDate)) {
        return undefined;
    }
    return (0, appointment_schedule_1.formatAppointmentSlotForMessage)({
        date: appointmentDate,
        time: "08:00",
        language: language ?? "en",
        timezone: getAppointmentMessageTimezone(),
    }).dateLabel;
}
function getAppointmentFriendlyTimeLabel(appointmentDate, appointmentTime, language) {
    if (!isNonEmptyString(appointmentDate) || !isNonEmptyString(appointmentTime)) {
        return undefined;
    }
    return (0, appointment_schedule_1.formatAppointmentSlotForMessage)({
        date: appointmentDate,
        time: appointmentTime,
        language: language ?? "en",
        timezone: getAppointmentMessageTimezone(),
    }).timeLabel;
}
function buildApprovedAlternateAppointmentReply(options) {
    const normalizedLanguage = isNonEmptyString(options.language)
        ? options.language.trim().toLowerCase()
        : "en";
    const clinicLabel = getClientClinicLabel();
    const dateLabel = getAppointmentFriendlyDateLabel(options.appointmentDate, options.language);
    const timeLabel = getAppointmentFriendlyTimeLabel(options.appointmentDate, options.appointmentTime, options.language);
    if (normalizedLanguage.startsWith("ar")) {
        return [
            "تم تأكيد الموعد المقترح.",
            dateLabel ? `التاريخ: ${dateLabel}` : undefined,
            timeLabel ? `الوقت: ${timeLabel}` : undefined,
            `العيادة: ${clinicLabel}`,
            "نشكر تأكيدك وننتظرك في الموعد.",
        ]
            .filter(Boolean)
            .join("\n");
    }
    if (normalizedLanguage.startsWith("de")) {
        return [
            "Der vorgeschlagene Termin wurde bestätigt.",
            dateLabel ? `Datum: ${dateLabel}` : undefined,
            timeLabel ? `Uhrzeit: ${timeLabel}` : undefined,
            `Praxis: ${clinicLabel}`,
            "Vielen Dank für Ihre Bestätigung.",
        ]
            .filter(Boolean)
            .join("\n");
    }
    return [
        "The proposed appointment has been confirmed.",
        dateLabel ? `Date: ${dateLabel}` : undefined,
        timeLabel ? `Time: ${timeLabel}` : undefined,
        `Clinic: ${clinicLabel}`,
        "Thank you for confirming this appointment.",
    ]
        .filter(Boolean)
        .join("\n");
}
function buildAlternateOfferDecisionRetryReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            "يرجى اختيار أحد الخيارين التاليين:",
            "1 تأكيد الموعد المقترح",
            "2 اختيار موعد آخر",
            "أرسل: 1 أو 2",
        ].join("\n"));
    }
    if (normalizedLanguage.startsWith("de")) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)([
            "Bitte wählen Sie eine der beiden Optionen:",
            "1 Diesen Termin bestätigen",
            "2 Einen anderen Termin auswählen",
            "Antworten Sie mit: 1 oder 2",
        ].join("\n"));
    }
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([
        "Please choose one of the two options below:",
        "1 Confirm this appointment",
        "2 Choose another appointment",
        "Reply with: 1 or 2",
    ].join("\n"));
}
async function findPendingAlternateAppointmentRequestForSession(sessionId) {
    return service_request_model_1.ServiceRequestModel.findOne({
        sessionId,
        statusCode: "alternate_offered",
        "resolutionData.awaitingPatientDecision": true,
    })
        .sort({ updatedAt: -1 })
        .select("_id statusCode resolutionData requestData language")
        .exec();
}
function extractDynamicChoiceSource(step) {
    if (!isPlainObject(step.stepConfig) || !isPlainObject(step.stepConfig.dynamicChoiceSource)) {
        return null;
    }
    const source = step.stepConfig.dynamicChoiceSource;
    if (source.type !== "weekly_schedule_dates" &&
        source.type !== "weekly_schedule_times") {
        return null;
    }
    const weeklySchedule = (0, appointment_schedule_1.sanitizeWeeklySchedule)(source.weeklySchedule);
    if (!weeklySchedule) {
        return null;
    }
    return {
        type: source.type,
        nextStepCode: isNonEmptyString(source.nextStepCode)
            ? normalizeStepCode(source.nextStepCode)
            : undefined,
        timezone: isNonEmptyString(source.timezone) ? source.timezone.trim() : undefined,
        daysAhead: typeof source.daysAhead === "number" ? source.daysAhead : undefined,
        maxDateOptions: typeof source.maxDateOptions === "number" ? source.maxDateOptions : undefined,
        selectedDateDataKey: isNonEmptyString(source.selectedDateDataKey)
            ? source.selectedDateDataKey.trim()
            : undefined,
        weeklySchedule,
    };
}
function buildRuntimeChoiceContextFromOptions(options, nextStepCode) {
    if (options.length === 0) {
        return null;
    }
    const choiceMap = options.reduce((result, option) => {
        result[option.input] = option.value;
        result[option.value] = option.value;
        return result;
    }, {});
    return {
        choiceMap,
        nextStepCode,
        optionLines: options.map((option) => `${option.input} ${option.label}`),
    };
}
function resolveCollectedDataValue(collectedData, dataKey) {
    if (!isNonEmptyString(dataKey) || !isPlainObject(collectedData)) {
        return undefined;
    }
    const value = collectedData[dataKey];
    return isNonEmptyString(value) ? value.trim() : undefined;
}
function resolveRuntimeChoiceContext(step, session) {
    const dynamicChoiceSource = extractDynamicChoiceSource(step);
    if (!dynamicChoiceSource) {
        return null;
    }
    const schedule = {
        timezone: dynamicChoiceSource.timezone,
        daysAhead: dynamicChoiceSource.daysAhead,
        maxDateOptions: dynamicChoiceSource.maxDateOptions,
        weeklySchedule: dynamicChoiceSource.weeklySchedule,
    };
    if (dynamicChoiceSource.type === "weekly_schedule_dates") {
        return buildRuntimeChoiceContextFromOptions((0, appointment_schedule_1.generateAppointmentDateOptions)({
            schedule,
            language: session.language,
        }), dynamicChoiceSource.nextStepCode);
    }
    const selectedDate = resolveCollectedDataValue(session.collectedData, dynamicChoiceSource.selectedDateDataKey ?? "appointment_date");
    if (!selectedDate) {
        return null;
    }
    return buildRuntimeChoiceContextFromOptions((0, appointment_schedule_1.generateAppointmentTimeOptions)({
        schedule,
        language: session.language,
        selectedDate,
    }), dynamicChoiceSource.nextStepCode);
}
async function resolvePreviousInteractiveStepBySequence(flowId, currentSequence) {
    if (typeof currentSequence !== "number" || !Number.isFinite(currentSequence)) {
        return null;
    }
    return flow_step_model_1.FlowStepModel.findOne({
        flowId,
        status: "active",
        type: { $in: ["choice", "input_text"] },
        sequence: { $lt: currentSequence },
    })
        .sort({ sequence: -1 })
        .lean();
}
async function resolvePreviousInteractiveStepFromHistory(sessionId, flowId, currentStepCode, currentSequence) {
    const priorResponses = await session_step_response_model_1.SessionStepResponseModel.find({ sessionId })
        .select("stepCode")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    const normalizedCurrentStepCode = normalizeStepCode(currentStepCode);
    for (const response of priorResponses) {
        if (!isNonEmptyString(response.stepCode)) {
            continue;
        }
        const responseStepCode = normalizeStepCode(response.stepCode);
        if (responseStepCode === normalizedCurrentStepCode) {
            continue;
        }
        const previousStep = await loadFlowStep(flowId, responseStepCode);
        if (previousStep && isInteractiveStepType(previousStep.type)) {
            return previousStep;
        }
    }
    return resolvePreviousInteractiveStepBySequence(flowId, currentSequence);
}
async function decorateInteractivePrompt(flowId, step, language, text) {
    const normalizedText = (0, messageFormatting_1.normalizeMessageTextFormatting)(text);
    if (!isInteractiveStepType(step.type)) {
        return normalizedText;
    }
    const previousInteractiveStep = await resolvePreviousInteractiveStepBySequence(flowId, step.sequence);
    if (!previousInteractiveStep) {
        return normalizedText;
    }
    const backOptionLine = getBackOptionLine(language);
    const backReplyHint = getBackReplyHint(language, step.type);
    const replyMarkers = ["reply with:", "\u0623\u0631\u0633\u0644:", "antworten sie mit:"];
    const normalizedLines = normalizedText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const normalizeComparableLine = (line) => line
        .replace(/\uFE0F?\u20E3/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const normalizedBackOptionLine = normalizeComparableLine(backOptionLine);
    const normalizedBackReplyHint = normalizeComparableLine(backReplyHint);
    const withoutExistingBackLines = normalizedLines.filter((line) => {
        const lowered = normalizeComparableLine(line);
        return (lowered !== normalizedBackOptionLine &&
            lowered !== normalizedBackReplyHint &&
            !lowered.includes("0 to go back") &&
            !lowered.includes("0 zum zur\u00fcckgehen") &&
            !lowered.includes("0 \u0631\u062c\u0648\u0639"));
    });
    const withoutExistingReplyHints = withoutExistingBackLines.filter((line) => {
        const lowered = normalizeComparableLine(line);
        return !replyMarkers.some((marker) => lowered.startsWith(marker));
    });
    return (0, messageFormatting_1.normalizeMessageTextFormatting)([...withoutExistingReplyHints, backOptionLine, backReplyHint].join("\n"));
}
async function buildStepPromptPayload(session, step, templateValues) {
    const resolvedTemplatePayload = await resolveTemplatePayloadByContentKey(step.contentKey, session.language);
    const outboundPayload = buildOutboundTemplatePayload(resolvedTemplatePayload, templateValues);
    const runtimeChoiceContext = step.type === "choice" ? resolveRuntimeChoiceContext(step, session) : null;
    if (runtimeChoiceContext && runtimeChoiceContext.optionLines.length > 0) {
        const normalizedBaseText = (0, messageFormatting_1.normalizeMessageTextFormatting)(outboundPayload.text);
        outboundPayload.text = (0, messageFormatting_1.normalizeMessageTextFormatting)([normalizedBaseText, ...runtimeChoiceContext.optionLines].filter(Boolean).join("\n"));
    }
    outboundPayload.text = await decorateInteractivePrompt(session.flowId, step, session.language, outboundPayload.text);
    return outboundPayload;
}
function getTransitionNextStepCode(rule) {
    const nextStep = "nextStepCode" in rule ? rule.nextStepCode : undefined;
    const toStep = "toStepCode" in rule ? rule.toStepCode : undefined;
    if (isNonEmptyString(nextStep)) {
        return normalizeStepCode(nextStep);
    }
    if (isNonEmptyString(toStep)) {
        return normalizeStepCode(toStep);
    }
    return undefined;
}
function isImageMimeType(value) {
    if (!isNonEmptyString(value)) {
        return false;
    }
    return value.trim().toLowerCase().startsWith("image/");
}
function inferImageMimeTypeFromFileName(fileName) {
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
    return undefined;
}
function getInsuranceCardOnlyReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0631\u0633\u0644\u0629 \u0644\u064a\u0633\u062a \u0628\u0637\u0627\u0642\u0629 \u062a\u0623\u0645\u064a\u0646 \u0635\u062d\u064a \u0648\u0627\u0636\u062d\u0629. \u064a\u0631\u062c\u0649 \u0625\u0631\u0633\u0627\u0644 \u0635\u0648\u0631\u0629 \u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646 \u0641\u0642\u0637.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Das gesendete Bild ist keine erkennbare Gesundheitskarte. Bitte senden Sie nur ein Foto Ihrer Versicherungskarte.";
    }
    return "The image you sent is not a clear health insurance card. Please send only a health insurance card photo.";
}
function getInsuranceCardImageRequiredReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u064a\u0631\u062c\u0649 \u0625\u0631\u0633\u0627\u0644 \u0635\u0648\u0631\u0629 \u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646 \u0641\u0642\u0637.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Bitte senden Sie nur ein Foto Ihrer Versicherungskarte.";
    }
    return "Please send only a health insurance card photo.";
}
function getInsuranceCardOcrUnavailableReply(language) {
    const normalizedLanguage = isNonEmptyString(language)
        ? language.trim().toLowerCase()
        : "en";
    if (normalizedLanguage.startsWith("ar")) {
        return "\u062a\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0635\u0648\u0631\u0629 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646 \u0645\u0624\u0642\u062a\u064b\u0627. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.";
    }
    if (normalizedLanguage.startsWith("de")) {
        return "Die Bildpr\u00fcfung ist momentan nicht verf\u00fcgbar. Bitte versuchen Sie es in K\u00fcrze erneut.";
    }
    return "Insurance card image reading is temporarily unavailable. Please try again shortly.";
}
async function loadInboundImageBufferForGemini(media) {
    const explicitMimeType = isNonEmptyString(media.mimeType)
        ? media.mimeType.trim()
        : undefined;
    const inferredMimeType = inferImageMimeTypeFromFileName(media.fileName);
    const mimeType = explicitMimeType ?? inferredMimeType ?? "image/jpeg";
    if (!isImageMimeType(mimeType)) {
        return null;
    }
    if (media.provider === "local" && isNonEmptyString(media.assetId)) {
        const filePath = await (0, media_cloudflare_service_1.resolveLocalMediaFilePath)(media.assetId);
        const imageBuffer = await (0, promises_1.readFile)(filePath);
        return {
            imageBuffer,
            mimeType,
        };
    }
    if (isNonEmptyString(media.url)) {
        const response = await fetch(media.url);
        if (!response.ok) {
            return null;
        }
        const responseMimeType = response.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim();
        const finalMimeType = explicitMimeType ?? responseMimeType ?? inferredMimeType ?? "image/jpeg";
        if (!isImageMimeType(finalMimeType)) {
            return null;
        }
        return {
            imageBuffer: Buffer.from(await response.arrayBuffer()),
            mimeType: finalMimeType,
        };
    }
    return null;
}
function extractResolvedTemplateMediaPayload(media) {
    if (!isPlainObject(media)) {
        return undefined;
    }
    const provider = isNonEmptyString(media.provider) ? media.provider.trim() : "";
    const assetId = isNonEmptyString(media.assetId) ? media.assetId.trim() : "";
    const url = isNonEmptyString(media.url) ? media.url.trim() : "";
    if (!provider || !assetId || !url) {
        return undefined;
    }
    return {
        provider,
        assetId,
        url,
        thumbnailUrl: isNonEmptyString(media.thumbnailUrl) ? media.thumbnailUrl.trim() : undefined,
        mimeType: isNonEmptyString(media.mimeType) ? media.mimeType.trim() : undefined,
        fileName: isNonEmptyString(media.fileName) ? media.fileName.trim() : undefined,
    };
}
async function resolveTemplatePayloadByContentKey(contentKey, language) {
    if (!isNonEmptyString(contentKey)) {
        return { text: "" };
    }
    const template = await content_template_model_1.ContentTemplateModel.findOne({ key: contentKey.trim() }).lean();
    if (!template) {
        return { text: "" };
    }
    const resolvedText = template.translations
        ? resolveTemplateTextByLanguage(template.translations, language)
        : "";
    return {
        text: resolvedText,
        contentType: isNonEmptyString(template.contentType)
            ? template.contentType.trim()
            : undefined,
        media: extractResolvedTemplateMediaPayload(template.media),
    };
}
function buildOutboundTemplatePayload(resolvedPayload, templateValues) {
    return {
        text: renderTemplateContent(resolvedPayload.text, templateValues),
        contentType: resolvedPayload.contentType,
        media: resolvedPayload.media,
    };
}
function resolveOutboundMessageType(payload) {
    if (payload.media?.url) {
        return "image";
    }
    return "text";
}
function resolveTemplateTextByLanguage(translations, sessionLanguage) {
    const normalizedLanguage = isNonEmptyString(sessionLanguage)
        ? sessionLanguage.trim().toLowerCase()
        : "";
    if (normalizedLanguage && isNonEmptyString(translations[normalizedLanguage])) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)(translations[normalizedLanguage].trim());
    }
    const baseLanguageKey = normalizedLanguage.split("-")[0];
    if (baseLanguageKey &&
        baseLanguageKey !== normalizedLanguage &&
        isNonEmptyString(translations[baseLanguageKey])) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)(translations[baseLanguageKey].trim());
    }
    if (isNonEmptyString(translations.en)) {
        return (0, messageFormatting_1.normalizeMessageTextFormatting)(translations.en.trim());
    }
    for (const value of Object.values(translations)) {
        if (isNonEmptyString(value)) {
            return (0, messageFormatting_1.normalizeMessageTextFormatting)(value.trim());
        }
    }
    return "";
}
function renderTemplateContent(templateText, templateValues) {
    if (!isNonEmptyString(templateText)) {
        return templateText;
    }
    return templateText.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (fullMatch, key) => {
        const value = templateValues[key];
        if (value === undefined || value === null) {
            return fullMatch;
        }
        return String(value);
    });
}
async function buildTemplateValuesForSession(session) {
    const templateValues = {};
    if (session.businessPartnerId) {
        const businessPartner = await business_partner_model_1.BusinessPartnerModel.findById(session.businessPartnerId)
            .select("names")
            .lean();
        if (businessPartner?.names) {
            if (businessPartner.names.fullName !== undefined && businessPartner.names.fullName !== null) {
                templateValues.name = businessPartner.names.fullName;
            }
            if (businessPartner.names.firstName !== undefined && businessPartner.names.firstName !== null) {
                templateValues.firstName = businessPartner.names.firstName;
            }
            if (businessPartner.names.lastName !== undefined && businessPartner.names.lastName !== null) {
                templateValues.lastName = businessPartner.names.lastName;
            }
        }
    }
    if (isPlainObject(session.collectedData)) {
        Object.assign(templateValues, session.collectedData);
    }
    return templateValues;
}
async function loadFlowStep(flowId, stepCode) {
    return flow_step_model_1.FlowStepModel.findOne({
        flowId,
        code: normalizeStepCode(stepCode),
    }).lean();
}
async function createOutboundBotMessage(session, stepCode, payload) {
    const hasText = isNonEmptyString(payload.text);
    const hasMedia = isNonEmptyString(payload.media?.url);
    if (!hasText && !hasMedia) {
        return null;
    }
    const now = new Date();
    const outboundMessageType = resolveOutboundMessageType(payload);
    const outboundContent = hasMedia
        ? {
            text: payload.text,
            caption: payload.text,
            mediaUrl: payload.media?.url,
            media: payload.media,
        }
        : {
            text: payload.text,
        };
    const outboundMessageDoc = await message_model_1.MessageModel.create({
        sessionId: session._id,
        channelId: session.channelId,
        channelAccountId: session.channelAccountId,
        direction: "outbound",
        actorType: "bot",
        messageType: outboundMessageType,
        content: outboundContent,
        sentAt: now,
        createdAt: now,
    });
    return {
        stepCode: normalizeStepCode(stepCode),
        messageId: String(outboundMessageDoc._id),
        text: payload.text,
    };
}
async function createServiceRequestOnSessionCompletion(session) {
    const flow = await flow_model_1.FlowModel.findById(session.flowId).lean();
    if (!flow?.settings?.createServiceRequestOnCompletion) {
        return undefined;
    }
    const requestData = isPlainObject(session.collectedData) ? session.collectedData : {};
    const { serviceId: serviceIdRaw, requestTypeId: requestTypeIdRaw } = resolveServiceRequestTargetFromFlow(flow, requestData);
    if (!serviceIdRaw || !requestTypeIdRaw) {
        return undefined;
    }
    if (!mongoose_1.default.isValidObjectId(serviceIdRaw) || !mongoose_1.default.isValidObjectId(requestTypeIdRaw)) {
        throw new BotEngineError("Flow settings serviceId/requestTypeId are invalid. Cannot auto-create service request.");
    }
    const serviceId = new mongoose_1.default.Types.ObjectId(serviceIdRaw);
    const requestTypeId = new mongoose_1.default.Types.ObjectId(requestTypeIdRaw);
    const [service, requestType] = await Promise.all([
        service_model_1.ServiceModel.findById(serviceId).lean(),
        request_type_model_1.RequestTypeModel.findById(requestTypeId).lean(),
    ]);
    if (!service) {
        throw new BotEngineError("Flow settings serviceId does not reference an existing service. Cannot auto-create service request.");
    }
    if (!requestType) {
        throw new BotEngineError("Flow settings requestTypeId does not reference an existing request type. Cannot auto-create service request.");
    }
    const [channel, orgUnit] = await Promise.all([
        channel_model_1.ChannelModel.findById(session.channelId).select("code").lean(),
        session.orgUnitId ? org_unit_model_1.OrgUnitModel.findById(session.orgUnitId).lean() : Promise.resolve(null),
    ]);
    const sourceChannelCode = channel && isNonEmptyString(channel.code) ? channel.code : "system";
    const now = new Date();
    const existingServiceRequest = await service_request_model_1.ServiceRequestModel.findOne({
        sessionId: session._id,
        serviceId,
        requestTypeId,
    })
        .select("_id statusCode")
        .lean();
    if (existingServiceRequest?._id) {
        await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(existingServiceRequest._id, {
            $set: {
                orgUnitId: session.orgUnitId ?? undefined,
                businessPartnerId: session.businessPartnerId ?? undefined,
                language: session.language,
                requestData,
                updatedAt: now,
            },
        }).exec();
        return String(existingServiceRequest._id);
    }
    const serviceRequest = await service_request_model_1.ServiceRequestModel.create({
        orgUnitId: session.orgUnitId ?? undefined,
        businessPartnerId: session.businessPartnerId ?? undefined,
        sessionId: session._id,
        serviceId,
        requestTypeId,
        statusCode: "new",
        priorityCode: "normal",
        sourceChannelCode,
        language: session.language,
        submittedAt: now,
        requestData,
        aiSummary: {},
        snapshots: {
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
            orgUnit: orgUnit
                ? {
                    code: orgUnit.code,
                    name: orgUnit.name
                        ? {
                            ar: orgUnit.name.ar,
                            en: orgUnit.name.en,
                            de: orgUnit.name.de,
                        }
                        : undefined,
                }
                : undefined,
        },
        createdAt: now,
        updatedAt: now,
    });
    return String(serviceRequest._id);
}
function parseStartSessionBody(body) {
    const channelAccountId = parseObjectId(body.channelAccountId, "channelAccountId", true);
    const flowId = parseObjectId(body.flowId, "flowId", true);
    const orgUnitId = parseObjectId(body.orgUnitId, "orgUnitId", false);
    const businessPartnerId = parseObjectId(body.businessPartnerId, "businessPartnerId", false);
    if (!isNonEmptyString(body.channelUserRef)) {
        throw new BotEngineError("Field 'channelUserRef' is required.");
    }
    if (!isNonEmptyString(body.language)) {
        throw new BotEngineError("Field 'language' is required.");
    }
    return {
        channelAccountId,
        channelUserRef: body.channelUserRef.trim(),
        flowId,
        language: body.language.trim(),
        orgUnitId,
        businessPartnerId,
    };
}
function parseProcessMessageBody(body) {
    const sessionId = parseObjectId(body.sessionId, "sessionId", true);
    if (!isNonEmptyString(body.messageType)) {
        throw new BotEngineError("Field 'messageType' is required.");
    }
    if (body.text !== undefined && body.text !== null && typeof body.text !== "string") {
        throw new BotEngineError("Field 'text' must be a string when provided.");
    }
    if (body.media !== undefined && body.media !== null && !isPlainObject(body.media)) {
        throw new BotEngineError("Field 'media' must be an object when provided.");
    }
    if (body.externalMessageId !== undefined && !isNonEmptyString(body.externalMessageId)) {
        throw new BotEngineError("Field 'externalMessageId' must be a non-empty string when provided.");
    }
    let parsedMedia;
    if (isPlainObject(body.media)) {
        const provider = isNonEmptyString(body.media.provider) ? body.media.provider.trim() : "";
        const assetId = isNonEmptyString(body.media.assetId) ? body.media.assetId.trim() : "";
        const url = isNonEmptyString(body.media.url) ? body.media.url.trim() : "";
        if (!provider || !assetId || !url) {
            throw new BotEngineError("Fields 'media.provider', 'media.assetId', and 'media.url' are required when media is provided.");
        }
        parsedMedia = {
            provider,
            assetId,
            url,
            thumbnailUrl: isNonEmptyString(body.media.thumbnailUrl)
                ? body.media.thumbnailUrl.trim()
                : undefined,
            mimeType: isNonEmptyString(body.media.mimeType) ? body.media.mimeType.trim() : undefined,
            fileName: isNonEmptyString(body.media.fileName) ? body.media.fileName.trim() : undefined,
        };
    }
    return {
        sessionId,
        messageType: body.messageType.trim(),
        text: typeof body.text === "string" ? body.text : undefined,
        media: parsedMedia,
        externalMessageId: body.externalMessageId?.trim(),
    };
}
async function resolveChoiceNextStepCode(transitionConfig, text) {
    if (!Array.isArray(transitionConfig)) {
        return null;
    }
    for (const entry of transitionConfig) {
        const rule = entry;
        if (!rule || typeof rule !== "object") {
            continue;
        }
        if (!("when" in rule) || typeof rule.when !== "object" || rule.when === null) {
            continue;
        }
        const condition = rule.when;
        if (condition.operator !== "eq") {
            continue;
        }
        const conditionValue = typeof condition.value === "string" ||
            typeof condition.value === "number" ||
            typeof condition.value === "boolean"
            ? String(condition.value).trim()
            : undefined;
        if (!isNonEmptyString(conditionValue)) {
            continue;
        }
        if (text === conditionValue) {
            const nextStepCode = getTransitionNextStepCode(rule);
            if (nextStepCode) {
                const ruleObject = rule;
                const semanticValueCandidate = (typeof ruleObject.normalizedValue === "string" &&
                    ruleObject.normalizedValue.trim().length > 0
                    ? ruleObject.normalizedValue
                    : undefined) ??
                    (typeof ruleObject.storeValue === "string" &&
                        ruleObject.storeValue.trim().length > 0
                        ? ruleObject.storeValue
                        : undefined) ??
                    conditionValue;
                return {
                    nextStepCode,
                    normalizedValue: typeof semanticValueCandidate === "string" && semanticValueCandidate.trim().length > 0
                        ? semanticValueCandidate.trim()
                        : undefined,
                };
            }
        }
    }
    return null;
}
async function resolveMessageNextStepCode(transitionConfig) {
    if (!Array.isArray(transitionConfig)) {
        return null;
    }
    for (const entry of transitionConfig) {
        const rule = entry;
        if (!rule || typeof rule !== "object") {
            continue;
        }
        if (rule.when === "always") {
            const nextStepCode = getTransitionNextStepCode(rule);
            if (nextStepCode) {
                return nextStepCode;
            }
        }
    }
    return null;
}
function extractStepDataKey(step) {
    if (!isPlainObject(step.stepConfig)) {
        return undefined;
    }
    const dataKey = step.stepConfig.dataKey;
    if (!isNonEmptyString(dataKey)) {
        return undefined;
    }
    return dataKey.trim();
}
function extractStepConfigBoolean(step, key) {
    if (!isPlainObject(step.stepConfig)) {
        return false;
    }
    return step.stepConfig[key] === true;
}
function resolveChoiceMapValue(step, normalizedInputText) {
    if (!isNonEmptyString(normalizedInputText)) {
        return undefined;
    }
    if (!isPlainObject(step.stepConfig)) {
        return undefined;
    }
    const choiceMap = step.stepConfig.choiceMap;
    if (!isPlainObject(choiceMap)) {
        return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(choiceMap, normalizedInputText)) {
        return undefined;
    }
    return choiceMap[normalizedInputText];
}
function resolveOrgUnitIdFromChoiceValue(step, semanticChoiceValue) {
    if (!isPlainObject(step.stepConfig)) {
        return undefined;
    }
    const orgUnitMap = step.stepConfig.orgUnitMap;
    if (!isPlainObject(orgUnitMap)) {
        return undefined;
    }
    const normalizedChoiceKey = semanticChoiceValue.trim();
    if (normalizedChoiceKey.length === 0) {
        return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(orgUnitMap, normalizedChoiceKey)) {
        return undefined;
    }
    const mappedOrgUnitIdValue = orgUnitMap[normalizedChoiceKey];
    if (!isNonEmptyString(mappedOrgUnitIdValue)) {
        return undefined;
    }
    const mappedOrgUnitId = mappedOrgUnitIdValue.trim();
    if (!mongoose_1.default.isValidObjectId(mappedOrgUnitId)) {
        return undefined;
    }
    return new mongoose_1.default.Types.ObjectId(mappedOrgUnitId);
}
function resolveServiceRequestTargetFromFlow(flow, collectedData) {
    const settings = flow && isPlainObject(flow.settings) ? flow.settings : {};
    const routingRules = Array.isArray(settings.serviceRequestRouting)
        ? settings.serviceRequestRouting
        : [];
    if (routingRules.length > 0 && isPlainObject(collectedData)) {
        for (const candidateRule of routingRules) {
            if (!isPlainObject(candidateRule)) {
                continue;
            }
            const dataKey = isNonEmptyString(candidateRule.whenDataKey)
                ? candidateRule.whenDataKey.trim()
                : undefined;
            const equals = hasUsableValue(candidateRule.equals)
                ? String(candidateRule.equals).trim()
                : undefined;
            const serviceId = isNonEmptyString(candidateRule.serviceId)
                ? candidateRule.serviceId.trim()
                : undefined;
            const requestTypeId = isNonEmptyString(candidateRule.requestTypeId)
                ? candidateRule.requestTypeId.trim()
                : undefined;
            if (!dataKey || !equals || !serviceId || !requestTypeId) {
                continue;
            }
            const currentValue = collectedData[dataKey];
            if (!hasUsableValue(currentValue)) {
                continue;
            }
            if (String(currentValue).trim() === equals) {
                return {
                    serviceId,
                    requestTypeId,
                };
            }
        }
    }
    return {
        serviceId: isNonEmptyString(settings.serviceId) ? settings.serviceId.trim() : undefined,
        requestTypeId: isNonEmptyString(settings.requestTypeId)
            ? settings.requestTypeId.trim()
            : undefined,
    };
}
async function startSession(body) {
    const parsed = parseStartSessionBody(body);
    const channelAccount = await channel_account_model_1.ChannelAccountModel.findById(parsed.channelAccountId).lean();
    if (!channelAccount) {
        throw new BotEngineError("channelAccountId does not reference an existing channel account.");
    }
    const flow = await flow_model_1.FlowModel.findById(parsed.flowId).lean();
    if (!flow) {
        throw new BotEngineError("flowId does not reference an existing flow.");
    }
    if (parsed.orgUnitId) {
        const orgUnitExists = await org_unit_model_1.OrgUnitModel.exists({ _id: parsed.orgUnitId });
        if (!orgUnitExists) {
            throw new BotEngineError("orgUnitId does not reference an existing org unit.");
        }
    }
    if (parsed.businessPartnerId) {
        const businessPartnerExists = await business_partner_model_1.BusinessPartnerModel.exists({ _id: parsed.businessPartnerId });
        if (!businessPartnerExists) {
            throw new BotEngineError("businessPartnerId does not reference an existing business partner.");
        }
    }
    const firstStep = await loadFlowStep(flow._id, flow.startStepCode);
    if (!firstStep) {
        throw new BotEngineError("Flow start step could not be found.", 404);
    }
    const now = new Date();
    const session = await bot_session_model_1.BotSessionModel.create({
        orgUnitId: parsed.orgUnitId,
        channelId: channelAccount.channelId,
        channelAccountId: parsed.channelAccountId,
        businessPartnerId: parsed.businessPartnerId,
        flowId: parsed.flowId,
        flowVersion: flow.version,
        statusCode: "active",
        language: parsed.language,
        channelUserRef: parsed.channelUserRef,
        currentStepCode: normalizeStepCode(flow.startStepCode),
        startedAt: now,
        lastActivityAt: now,
    });
    const templateValues = await buildTemplateValuesForSession(session);
    const outboundPayload = await buildStepPromptPayload(session, firstStep, templateValues);
    const currentContent = outboundPayload.text;
    const outboundMessage = await createOutboundBotMessage(session, firstStep.code, outboundPayload);
    return {
        session: session.toObject(),
        currentStep: firstStep,
        currentContent,
        createdOutboundMessageId: outboundMessage ? outboundMessage.messageId : null,
    };
}
async function processMessage(body) {
    const parsed = parseProcessMessageBody(body);
    const session = await bot_session_model_1.BotSessionModel.findById(parsed.sessionId);
    if (!session) {
        throw new BotEngineError("sessionId does not reference an existing bot session.", 404);
    }
    if (!isNonEmptyString(session.currentStepCode)) {
        throw new BotEngineError("Session currentStepCode is not set.", 400);
    }
    const previousStepCode = normalizeStepCode(session.currentStepCode);
    const currentStep = await loadFlowStep(session.flowId, previousStepCode);
    if (!currentStep) {
        throw new BotEngineError("Current flow step could not be found.", 404);
    }
    const now = new Date();
    const normalizedInputText = typeof parsed.text === "string" ? parsed.text.trim() : undefined;
    const inboundMessageContent = {};
    if (typeof parsed.text === "string") {
        inboundMessageContent.text = parsed.text;
    }
    if (parsed.media) {
        inboundMessageContent.media = parsed.media;
        inboundMessageContent.mediaUrl = parsed.media.url;
        if (typeof parsed.text === "string" && parsed.text.trim().length > 0) {
            inboundMessageContent.caption = parsed.text.trim();
        }
    }
    if (!("text" in inboundMessageContent) && !("media" in inboundMessageContent)) {
        inboundMessageContent.text = parsed.text;
    }
    const messageDoc = await message_model_1.MessageModel.create({
        sessionId: session._id,
        channelId: session.channelId,
        channelAccountId: session.channelAccountId,
        direction: "inbound",
        actorType: "customer",
        messageType: parsed.messageType,
        externalMessageId: parsed.externalMessageId,
        content: inboundMessageContent,
        createdAt: now,
        receivedAt: now,
    });
    const pendingAlternateAppointmentRequest = await findPendingAlternateAppointmentRequestForSession(session._id);
    if (pendingAlternateAppointmentRequest) {
        const resolutionData = isPlainObject(pendingAlternateAppointmentRequest.resolutionData)
            ? pendingAlternateAppointmentRequest.resolutionData
            : {};
        const requestData = isPlainObject(pendingAlternateAppointmentRequest.requestData)
            ? pendingAlternateAppointmentRequest.requestData
            : {};
        const alternateDate = isNonEmptyString(resolutionData.alternateDate)
            ? resolutionData.alternateDate.trim()
            : undefined;
        const alternateTime = isNonEmptyString(resolutionData.alternateTime)
            ? resolutionData.alternateTime.trim()
            : undefined;
        if (isAlternateOfferConfirmCommand(normalizedInputText)) {
            const reply = buildApprovedAlternateAppointmentReply({
                language: session.language,
                appointmentDate: alternateDate,
                appointmentTime: alternateTime,
            });
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(pendingAlternateAppointmentRequest._id, {
                $set: {
                    statusCode: "approved",
                    resolutionData: {
                        ...resolutionData,
                        decision: "approved",
                        previousDecision: isNonEmptyString(resolutionData.decision)
                            ? resolutionData.decision.trim()
                            : "alternate_offer",
                        awaitingPatientDecision: false,
                        patientDecision: "confirmed",
                        patientRespondedAt: now.toISOString(),
                        approvedDate: alternateDate,
                        approvedTime: alternateTime,
                        acceptedAlternateDate: alternateDate,
                        acceptedAlternateTime: alternateTime,
                    },
                    requestData: {
                        ...requestData,
                        appointment_date: alternateDate ?? requestData.appointment_date,
                        appointment_time: alternateTime ?? requestData.appointment_time,
                    },
                },
            }).exec();
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: String(pendingAlternateAppointmentRequest._id),
            };
        }
        if (isAlternateOfferRechooseCommand(normalizedInputText)) {
            const appointmentDateStep = await loadFlowStep(session.flowId, "APPOINTMENT_DATE");
            if (!appointmentDateStep) {
                throw new BotEngineError("Appointment date step could not be found for rescheduling.", 404);
            }
            const currentCollectedData = isPlainObject(session.collectedData)
                ? session.collectedData
                : {};
            const { appointment_date: _ignoredDate, appointment_time: _ignoredTime, ...remainingCollectedData } = currentCollectedData;
            session.statusCode = "active";
            session.endedAt = undefined;
            session.currentStepCode = "APPOINTMENT_DATE";
            session.collectedData = remainingCollectedData;
            session.lastActivityAt = now;
            await service_request_model_1.ServiceRequestModel.findByIdAndUpdate(pendingAlternateAppointmentRequest._id, {
                $set: {
                    statusCode: "new",
                    resolutionData: {
                        ...resolutionData,
                        awaitingPatientDecision: false,
                        patientDecision: "rechoose",
                        patientRespondedAt: now.toISOString(),
                    },
                    requestData: (() => {
                        const { appointment_date: _dropDate, appointment_time: _dropTime, ...remainingRequestData } = requestData;
                        return remainingRequestData;
                    })(),
                },
            }).exec();
            const templateValues = await buildTemplateValuesForSession(session);
            const outboundPayload = await buildStepPromptPayload(session, appointmentDateStep, templateValues);
            const outbound = await createOutboundBotMessage(session, appointmentDateStep.code, outboundPayload);
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: "APPOINTMENT_DATE",
                sessionStatus: session.statusCode,
                nextStep: appointmentDateStep,
                nextContent: outboundPayload.text,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: String(pendingAlternateAppointmentRequest._id),
            };
        }
        const retryReply = buildAlternateOfferDecisionRetryReply(session.language);
        const retryOutbound = await createOutboundBotMessage(session, previousStepCode, {
            text: retryReply,
        });
        session.lastActivityAt = now;
        await session.save();
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: previousStepCode,
            sessionStatus: session.statusCode,
            nextStep: currentStep,
            nextContent: retryReply,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: "",
            createdOutboundMessages: retryOutbound ? [retryOutbound] : [],
            createdServiceRequestId: String(pendingAlternateAppointmentRequest._id),
        };
    }
    if (isBackCommand(normalizedInputText)) {
        const previousInteractiveStep = await resolvePreviousInteractiveStepFromHistory(session._id, session.flowId, previousStepCode, currentStep.sequence);
        if (!previousInteractiveStep) {
            const reply = await decorateInteractivePrompt(session.flowId, currentStep, session.language, getAlreadyAtFirstStepReply(session.language));
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
        session.currentStepCode = normalizeStepCode(previousInteractiveStep.code);
        session.lastActivityAt = now;
        await session.save();
        const templateValues = await buildTemplateValuesForSession(session);
        const previousOutboundPayload = await buildStepPromptPayload(session, previousInteractiveStep, templateValues);
        const outbound = await createOutboundBotMessage(session, previousInteractiveStep.code, previousOutboundPayload);
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: normalizeStepCode(previousInteractiveStep.code),
            sessionStatus: session.statusCode,
            nextStep: previousInteractiveStep,
            nextContent: previousOutboundPayload.text,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: "",
            createdOutboundMessages: outbound ? [outbound] : [],
            createdServiceRequestId: undefined,
        };
    }
    if (isRestartCommand(normalizedInputText)) {
        const flow = await flow_model_1.FlowModel.findById(session.flowId).lean();
        if (!flow) {
            throw new BotEngineError("Session flow could not be found.", 404);
        }
        const restartStepCode = normalizeStepCode(flow.startStepCode);
        const restartStep = await loadFlowStep(session.flowId, restartStepCode);
        if (!restartStep) {
            throw new BotEngineError("Flow start step could not be found.", 404);
        }
        session.statusCode = "active";
        session.currentStepCode = restartStepCode;
        session.collectedData = {};
        session.endedAt = undefined;
        session.lastActivityAt = now;
        await session.save();
        const templateValues = await buildTemplateValuesForSession(session);
        const restartOutboundPayload = await buildStepPromptPayload(session, restartStep, templateValues);
        const restartOutbound = await createOutboundBotMessage(session, restartStep.code, restartOutboundPayload);
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: restartStepCode,
            sessionStatus: session.statusCode,
            nextStep: restartStep,
            nextContent: restartOutboundPayload.text,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: "",
            createdOutboundMessages: restartOutbound ? [restartOutbound] : [],
            createdServiceRequestId: undefined,
        };
    }
    const normalizedText = normalizedInputText ?? "";
    const stepDataKey = extractStepDataKey(currentStep);
    const isMediaOnlyUploadStep = currentStep.type === "input_text" && extractStepConfigBoolean(currentStep, "mediaOnly");
    const isMultiMediaUploadStep = isMultiMediaCollectionStep(currentStep, stepDataKey);
    const existingCollectedMediaItems = isMultiMediaUploadStep
        ? getCollectedMediaItems(session.collectedData, stepDataKey)
        : [];
    const isFinishingMultiMediaUpload = isMultiMediaUploadStep && isMultiMediaUploadFinishCommand(normalizedInputText);
    const isInsuranceCardImageStep = currentStep.type === "input_text" &&
        isNonEmptyString(stepDataKey) &&
        stepDataKey.trim().toLowerCase() === "insurance_card_image";
    let validatedInsuranceCardOcrResult;
    if (isMultiMediaUploadStep && isFinishingMultiMediaUpload) {
        if (existingCollectedMediaItems.length === 0) {
            const templateValues = await buildTemplateValuesForSession(session);
            const currentPromptPayload = await buildStepPromptPayload(session, currentStep, templateValues);
            const reply = (0, messageFormatting_1.normalizeMessageTextFormatting)(`${getMultiMediaUploadMissingFilesReply(session.language)}\n\n${currentPromptPayload.text}`);
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
    }
    else if (isMediaOnlyUploadStep && !parsed.media) {
        const templateValues = await buildTemplateValuesForSession(session);
        const currentPromptPayload = await buildStepPromptPayload(session, currentStep, templateValues);
        const reply = (0, messageFormatting_1.normalizeMessageTextFormatting)(`${getMediaAttachmentRequiredReply(session.language)}\n\n${currentPromptPayload.text}`);
        const outbound = await createOutboundBotMessage(session, previousStepCode, {
            text: reply,
        });
        session.lastActivityAt = now;
        await session.save();
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: previousStepCode,
            sessionStatus: session.statusCode,
            nextStep: currentStep,
            nextContent: reply,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: "",
            createdOutboundMessages: outbound ? [outbound] : [],
            createdServiceRequestId: undefined,
        };
    }
    if (isInsuranceCardImageStep) {
        if (!parsed.media) {
            const reply = getInsuranceCardImageRequiredReply(session.language);
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
        const imagePayload = await loadInboundImageBufferForGemini(parsed.media);
        if (!imagePayload) {
            const reply = getInsuranceCardImageRequiredReply(session.language);
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
        try {
            validatedInsuranceCardOcrResult = await (0, gemini_service_1.extractInsuranceCardFieldsFromImage)({
                imageBuffer: imagePayload.imageBuffer,
                mimeType: imagePayload.mimeType,
            });
        }
        catch (error) {
            const reply = (0, gemini_service_1.isGeminiQuotaError)(error)
                ? getInsuranceCardOcrUnavailableReply(session.language)
                : getInsuranceCardImageRequiredReply(session.language);
            if ((0, gemini_service_1.isGeminiQuotaError)(error)) {
                console.warn("[bot-engine] insurance card OCR skipped: Gemini quota exhausted.");
            }
            else {
                console.error("[bot-engine] insurance card validation failed:", error);
            }
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
        if (!validatedInsuranceCardOcrResult.isInsuranceCard) {
            const reply = getInsuranceCardOnlyReply(session.language);
            const outbound = await createOutboundBotMessage(session, previousStepCode, {
                text: reply,
            });
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: reply,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: "",
                createdOutboundMessages: outbound ? [outbound] : [],
                createdServiceRequestId: undefined,
            };
        }
    }
    const runtimeChoiceContext = currentStep.type === "choice" ? resolveRuntimeChoiceContext(currentStep, session) : null;
    const choiceTransitionMatch = currentStep.type === "choice"
        ? runtimeChoiceContext?.nextStepCode && isNonEmptyString(normalizedInputText)
            ? {
                nextStepCode: runtimeChoiceContext.nextStepCode,
                normalizedValue: runtimeChoiceContext.choiceMap[normalizedInputText],
            }
            : await resolveChoiceNextStepCode(currentStep.transitionConfig, normalizedInputText)
        : null;
    const mappedChoiceValue = currentStep.type === "choice"
        ? runtimeChoiceContext && isNonEmptyString(normalizedInputText)
            ? runtimeChoiceContext.choiceMap[normalizedInputText]
            : resolveChoiceMapValue(currentStep, normalizedInputText)
        : undefined;
    const resolvedChoiceValue = currentStep.type === "choice"
        ? (hasUsableValue(mappedChoiceValue)
            ? mappedChoiceValue
            : choiceTransitionMatch?.normalizedValue ?? (normalizedText.length > 0 ? normalizedText : undefined))
        : undefined;
    let stepResponseNormalizedValue = normalizedInputText;
    if (!hasUsableValue(stepResponseNormalizedValue) && parsed.media?.url) {
        stepResponseNormalizedValue = parsed.media.url;
    }
    let stepResponseStructuredData = {
        rawText: parsed.text,
        text: normalizedInputText ?? parsed.text,
    };
    if (parsed.media) {
        stepResponseStructuredData = {
            ...stepResponseStructuredData,
            media: parsed.media,
            mediaUrl: parsed.media.url,
            aiValidation: validatedInsuranceCardOcrResult
                ? {
                    type: "insurance_card",
                    isInsuranceCard: validatedInsuranceCardOcrResult.isInsuranceCard,
                    model: validatedInsuranceCardOcrResult.model,
                    rawText: validatedInsuranceCardOcrResult.rawText,
                    fields: validatedInsuranceCardOcrResult.fields,
                }
                : undefined,
        };
    }
    let collectedDataValueToStore;
    if (currentStep.type === "choice" && hasUsableValue(resolvedChoiceValue)) {
        stepResponseNormalizedValue = resolvedChoiceValue;
        stepResponseStructuredData = {
            rawText: parsed.text,
            text: normalizedInputText ?? parsed.text,
            value: resolvedChoiceValue,
            selectedValue: resolvedChoiceValue,
        };
        if (isNonEmptyString(stepDataKey)) {
            collectedDataValueToStore = resolvedChoiceValue;
            if (stepDataKey.trim().toLowerCase() === "selected_language" &&
                hasUsableValue(mappedChoiceValue)) {
                const normalizedSessionLanguage = String(mappedChoiceValue).trim();
                if (normalizedSessionLanguage.length > 0) {
                    session.language = normalizedSessionLanguage;
                }
            }
            if (stepDataKey.trim().toLowerCase() === "selected_clinic" &&
                hasUsableValue(mappedChoiceValue)) {
                const normalizedChoiceValue = String(resolvedChoiceValue).trim();
                if (normalizedChoiceValue.length > 0) {
                    const mappedOrgUnitId = resolveOrgUnitIdFromChoiceValue(currentStep, normalizedChoiceValue);
                    if (mappedOrgUnitId) {
                        session.orgUnitId = mappedOrgUnitId;
                    }
                }
            }
        }
    }
    if (currentStep.type === "input_text" &&
        isNonEmptyString(stepDataKey)) {
        if (parsed.media) {
            collectedDataValueToStore = {
                provider: parsed.media.provider,
                assetId: parsed.media.assetId,
                url: parsed.media.url,
                thumbnailUrl: parsed.media.thumbnailUrl,
                mimeType: parsed.media.mimeType,
                fileName: parsed.media.fileName,
                caption: normalizedText.length > 0 ? normalizedText : undefined,
                messageType: parsed.messageType,
                aiValidation: validatedInsuranceCardOcrResult
                    ? {
                        type: "insurance_card",
                        isInsuranceCard: validatedInsuranceCardOcrResult.isInsuranceCard,
                        model: validatedInsuranceCardOcrResult.model,
                        rawText: validatedInsuranceCardOcrResult.rawText,
                        fields: validatedInsuranceCardOcrResult.fields,
                    }
                    : undefined,
            };
        }
        else if (normalizedText.length > 0 && !isFinishingMultiMediaUpload) {
            collectedDataValueToStore = normalizedText;
        }
    }
    const stepResponseDoc = await session_step_response_model_1.SessionStepResponseModel.create({
        sessionId: session._id,
        flowId: session.flowId,
        flowVersion: session.flowVersion,
        stepCode: previousStepCode,
        stepType: currentStep.type,
        inputType: parsed.messageType,
        rawInput: parsed.text,
        normalizedValue: stepResponseNormalizedValue,
        structuredData: stepResponseStructuredData,
        validationResult: { valid: true, errors: [] },
        createdAt: now,
    });
    if (isNonEmptyString(stepDataKey) && hasUsableValue(collectedDataValueToStore)) {
        const currentCollectedData = isPlainObject(session.collectedData)
            ? session.collectedData
            : {};
        session.collectedData = {
            ...currentCollectedData,
            [stepDataKey]: isMultiMediaUploadStep && parsed.media
                ? [...existingCollectedMediaItems, collectedDataValueToStore]
                : collectedDataValueToStore,
        };
    }
    if (isMultiMediaUploadStep && parsed.media) {
        const uploadedCount = existingCollectedMediaItems.length + 1;
        const reply = getMultiMediaUploadContinueReply(session.language, uploadedCount);
        const outbound = await createOutboundBotMessage(session, previousStepCode, {
            text: reply,
        });
        session.lastActivityAt = now;
        await session.save();
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: previousStepCode,
            sessionStatus: session.statusCode,
            nextStep: currentStep,
            nextContent: reply,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: String(stepResponseDoc._id),
            createdOutboundMessages: outbound ? [outbound] : [],
            createdServiceRequestId: undefined,
        };
    }
    const templateValues = await buildTemplateValuesForSession(session);
    const createdOutboundMessages = [];
    let createdServiceRequestId;
    if (currentStep.type === "end") {
        session.statusCode = "completed";
        session.endedAt = now;
        session.lastActivityAt = now;
        await session.save();
        createdServiceRequestId = await createServiceRequestOnSessionCompletion(session);
        const resolvedEndTemplatePayload = await resolveTemplatePayloadByContentKey(currentStep.contentKey, session.language);
        const endContent = renderTemplateContent(resolvedEndTemplatePayload.text, templateValues);
        return {
            sessionId: String(session._id),
            previousStepCode,
            nextStepCode: previousStepCode,
            sessionStatus: session.statusCode,
            nextStep: currentStep,
            nextContent: endContent,
            createdInboundMessageId: String(messageDoc._id),
            createdStepResponseId: String(stepResponseDoc._id),
            createdOutboundMessages,
            createdServiceRequestId,
        };
    }
    let resolvedNextStepCode = previousStepCode;
    let transitionResolved = false;
    if (currentStep.type === "choice") {
        if (choiceTransitionMatch?.nextStepCode) {
            resolvedNextStepCode = choiceTransitionMatch.nextStepCode;
            transitionResolved = true;
        }
        else {
            const retryOutboundPayload = await buildStepPromptPayload(session, currentStep, templateValues);
            retryOutboundPayload.text = (0, messageFormatting_1.normalizeMessageTextFormatting)(`${getInvalidChoiceReply(session.language)}\n\n${retryOutboundPayload.text}`);
            const retryOutbound = await createOutboundBotMessage(session, previousStepCode, retryOutboundPayload);
            session.lastActivityAt = now;
            await session.save();
            return {
                sessionId: String(session._id),
                previousStepCode,
                nextStepCode: previousStepCode,
                sessionStatus: session.statusCode,
                nextStep: currentStep,
                nextContent: retryOutboundPayload.text,
                createdInboundMessageId: String(messageDoc._id),
                createdStepResponseId: String(stepResponseDoc._id),
                createdOutboundMessages: retryOutbound ? [...createdOutboundMessages, retryOutbound] : createdOutboundMessages,
                createdServiceRequestId,
            };
        }
    }
    else if (currentStep.type === "message") {
        const alwaysStepCode = await resolveMessageNextStepCode(currentStep.transitionConfig);
        if (alwaysStepCode) {
            resolvedNextStepCode = alwaysStepCode;
            transitionResolved = true;
        }
    }
    else if (currentStep.type === "input_text") {
        const alwaysStepCode = await resolveMessageNextStepCode(currentStep.transitionConfig);
        if (alwaysStepCode) {
            resolvedNextStepCode = alwaysStepCode;
            transitionResolved = true;
        }
    }
    let nextStep = currentStep;
    let nextStepCode = previousStepCode;
    let nextContent = "";
    if (transitionResolved) {
        const resolvedStep = await loadFlowStep(session.flowId, resolvedNextStepCode);
        if (!resolvedStep) {
            throw new BotEngineError(`Next flow step '${resolvedNextStepCode}' could not be found.`, 404);
        }
        nextStep = resolvedStep;
        nextStepCode = normalizeStepCode(resolvedStep.code);
    }
    session.currentStepCode = nextStepCode;
    session.lastActivityAt = now;
    let promptTemplateValues = templateValues;
    if (normalizeStepCode(nextStep.code) === "END_SUCCESS_MESSAGE") {
        const terminalStepCode = await resolveMessageNextStepCode(nextStep.transitionConfig);
        const terminalStep = terminalStepCode
            ? await loadFlowStep(session.flowId, terminalStepCode)
            : null;
        if (terminalStep?.type === "end") {
            session.statusCode = "completed";
            session.endedAt = now;
            session.currentStepCode = normalizeStepCode(terminalStep.code);
            await session.save();
            createdServiceRequestId = await createServiceRequestOnSessionCompletion(session);
            if (createdServiceRequestId) {
                promptTemplateValues = {
                    ...templateValues,
                    requestNumber: buildServiceRequestReference(createdServiceRequestId),
                };
            }
        }
    }
    const firstOutboundPayload = await buildStepPromptPayload(session, nextStep, promptTemplateValues);
    nextContent = firstOutboundPayload.text;
    const firstOutbound = await createOutboundBotMessage(session, nextStepCode, firstOutboundPayload);
    if (firstOutbound) {
        createdOutboundMessages.push(firstOutbound);
    }
    if (nextStep.type === "end") {
        session.statusCode = "completed";
        session.endedAt = now;
    }
    const autoAdvancedMessageStepCodes = new Set([nextStepCode]);
    let autoAdvanceDepth = 0;
    while (nextStep.type === "message") {
        if (autoAdvanceDepth >= MAX_MESSAGE_AUTO_ADVANCE_DEPTH) {
            throw new BotEngineError(`Message auto-advance exceeded ${MAX_MESSAGE_AUTO_ADVANCE_DEPTH} transitions. Check message-step always transitions for a cycle.`);
        }
        const autoNextStepCode = await resolveMessageNextStepCode(nextStep.transitionConfig);
        if (!autoNextStepCode) {
            break;
        }
        if (autoAdvancedMessageStepCodes.has(autoNextStepCode)) {
            throw new BotEngineError(`Message auto-advance cycle detected at step '${autoNextStepCode}'. Check message-step always transitions.`);
        }
        const autoNextStep = await loadFlowStep(session.flowId, autoNextStepCode);
        if (!autoNextStep) {
            throw new BotEngineError(`Next flow step '${autoNextStepCode}' could not be found.`, 404);
        }
        nextStep = autoNextStep;
        nextStepCode = normalizeStepCode(autoNextStep.code);
        autoAdvancedMessageStepCodes.add(nextStepCode);
        autoAdvanceDepth += 1;
        session.currentStepCode = nextStepCode;
        const autoOutboundPayload = await buildStepPromptPayload(session, nextStep, templateValues);
        nextContent = autoOutboundPayload.text;
        const autoOutbound = await createOutboundBotMessage(session, nextStepCode, autoOutboundPayload);
        if (autoOutbound) {
            createdOutboundMessages.push(autoOutbound);
        }
        if (nextStep.type === "end") {
            session.statusCode = "completed";
            session.endedAt = now;
            break;
        }
        if (nextStep.type === "choice") {
            break;
        }
        if (nextStep.type !== "message") {
            break;
        }
    }
    await session.save();
    if (session.statusCode === "completed") {
        createdServiceRequestId = await createServiceRequestOnSessionCompletion(session);
    }
    return {
        sessionId: String(session._id),
        previousStepCode,
        nextStepCode,
        sessionStatus: session.statusCode,
        nextStep: nextStep,
        nextContent,
        createdInboundMessageId: String(messageDoc._id),
        createdStepResponseId: String(stepResponseDoc._id),
        createdOutboundMessages,
        createdServiceRequestId,
    };
}
function isBotEngineError(error) {
    return error instanceof BotEngineError;
}
