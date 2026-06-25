"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBaileysTextMessage = sendBaileysTextMessage;
exports.startBaileys = startBaileys;
exports.getBaileysStatus = getBaileysStatus;
exports.getBaileysQr = getBaileysQr;
exports.restoreConnectedBaileysAccounts = restoreConnectedBaileysAccounts;
exports.logoutBaileys = logoutBaileys;
exports.isBaileysIntegrationError = isBaileysIntegrationError;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const promises_1 = require("fs/promises");
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../config/env");
const channel_account_model_1 = require("../../modules/channel-accounts/channel-account.model");
const channel_model_1 = require("../../modules/channels/channel.model");
const interested_lead_service_1 = require("../../modules/interested-leads/interested-lead.service");
const baileys_manager_1 = require("./baileys.manager");
class BaileysIntegrationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "BaileysIntegrationError";
        this.statusCode = statusCode;
    }
}
const pendingStartOperations = new Map();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function parseChannelAccountId(channelAccountId) {
    const normalizedValue = typeof channelAccountId === "string"
        ? channelAccountId.trim()
        : channelAccountId instanceof mongoose_1.default.Types.ObjectId
            ? channelAccountId.toString()
            : "";
    if (!normalizedValue) {
        throw new BaileysIntegrationError("Field 'channelAccountId' is required.");
    }
    if (!mongoose_1.default.isValidObjectId(normalizedValue)) {
        throw new BaileysIntegrationError("Field 'channelAccountId' must be a valid ObjectId.");
    }
    return normalizedValue;
}
function sanitizeForPath(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}
function createNotInitializedState(channelAccountId) {
    return {
        channelAccountId,
        initialized: false,
        connected: false,
        status: "not_initialized",
        lastConnectionUpdate: null,
        lastErrorMessage: null,
        qrAvailable: false,
        phoneNumber: null,
    };
}
function createConnectingState(channelAccountId, phoneNumber = null) {
    return {
        channelAccountId,
        initialized: true,
        connected: false,
        status: "connecting",
        lastConnectionUpdate: new Date().toISOString(),
        lastErrorMessage: null,
        qrAvailable: false,
        phoneNumber,
    };
}
function createQrResult(channelAccountId, qr) {
    return {
        channelAccountId,
        qr,
    };
}
function extractPhoneNumber(socket) {
    const maybeSocketUserId = socket.user?.id;
    if (!isNonEmptyString(maybeSocketUserId)) {
        return null;
    }
    return maybeSocketUserId.split("@")[0] || null;
}
function readDisconnectStatusCode(update) {
    const maybeError = update.lastDisconnect?.error;
    return maybeError?.output?.statusCode;
}
function getDisconnectMessage(statusCode) {
    switch (statusCode) {
        case baileys_1.DisconnectReason.connectionReplaced:
            return "WhatsApp replaced this linked-device session. Close the other active WhatsApp Web session, then start pairing again.";
        case baileys_1.DisconnectReason.loggedOut:
            return "WhatsApp logged this device out. Pair the account again to continue.";
        case baileys_1.DisconnectReason.multideviceMismatch:
            return "WhatsApp rejected this session because multi-device support is not available for the account.";
        case baileys_1.DisconnectReason.forbidden:
            return "WhatsApp rejected this session. Check the linked account and pair again.";
        case baileys_1.DisconnectReason.badSession:
            return "WhatsApp session data is invalid. Log out, clear the pairing, and scan a new QR code.";
        default:
            return statusCode
                ? `WhatsApp connection closed with code ${statusCode}.`
                : "WhatsApp connection closed unexpectedly.";
    }
}
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function getStringProperty(record, key) {
    const value = record[key];
    return isNonEmptyString(value) ? value.trim() : null;
}
function extractTextFromMessageContent(value, depth = 0) {
    if (depth > 4) {
        return null;
    }
    const content = asRecord(value);
    if (!content) {
        return null;
    }
    const directConversation = getStringProperty(content, "conversation");
    if (directConversation) {
        return directConversation;
    }
    const nestedTextKeys = [
        ["extendedTextMessage", ["text"]],
        ["imageMessage", ["caption"]],
        ["videoMessage", ["caption"]],
        ["buttonsResponseMessage", ["selectedDisplayText", "selectedButtonId"]],
        ["templateButtonReplyMessage", ["selectedDisplayText", "selectedId"]],
    ];
    for (const [messageKey, textKeys] of nestedTextKeys) {
        const nestedMessage = asRecord(content[messageKey]);
        if (!nestedMessage) {
            continue;
        }
        for (const textKey of textKeys) {
            const text = getStringProperty(nestedMessage, textKey);
            if (text) {
                return text;
            }
        }
    }
    const listResponseMessage = asRecord(content.listResponseMessage);
    const singleSelectReply = asRecord(listResponseMessage?.singleSelectReply);
    const listReplyText = getStringProperty(listResponseMessage ?? {}, "title") ??
        getStringProperty(listResponseMessage ?? {}, "description") ??
        getStringProperty(singleSelectReply ?? {}, "selectedRowId");
    if (listReplyText) {
        return listReplyText;
    }
    const wrappers = [
        "ephemeralMessage",
        "viewOnceMessage",
        "viewOnceMessageV2",
        "viewOnceMessageV2Extension",
        "documentWithCaptionMessage",
    ];
    for (const wrapperKey of wrappers) {
        const wrapper = asRecord(content[wrapperKey]);
        const wrappedMessage = wrapper ? wrapper.message : undefined;
        const text = extractTextFromMessageContent(wrappedMessage, depth + 1);
        if (text) {
            return text;
        }
    }
    return null;
}
function extractIncomingMessageText(message) {
    return extractTextFromMessageContent(message.message);
}
function shouldIgnoreIncomingJid(channelUserRef) {
    return (channelUserRef === "status@broadcast" ||
        channelUserRef.endsWith("@broadcast") ||
        channelUserRef.endsWith("@g.us"));
}
function getIncomingDisplayName(message) {
    const pushName = message.pushName;
    return isNonEmptyString(pushName) ? pushName.trim().slice(0, 140) : undefined;
}
async function resolveBaileysWebVersion() {
    try {
        const result = await (0, baileys_1.fetchLatestWaWebVersion)();
        const resolvedVersion = Array.isArray(result.version) ? result.version : undefined;
        if (resolvedVersion &&
            resolvedVersion.length === 3 &&
            resolvedVersion.every((part) => typeof part === "number" && Number.isFinite(part))) {
            return resolvedVersion;
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
async function validateChannelAccountAndChannel(channelAccountId) {
    const channelAccount = await channel_account_model_1.ChannelAccountModel.findById(channelAccountId).lean();
    if (!channelAccount) {
        throw new BaileysIntegrationError("Channel account not found.", 404);
    }
    if (channelAccount.status === "blocked") {
        throw new BaileysIntegrationError("Channel account is blocked and cannot be started.");
    }
    const channel = await channel_model_1.ChannelModel.findById(channelAccount.channelId).lean();
    if (!channel) {
        throw new BaileysIntegrationError("Related channel not found.", 404);
    }
    if (channel.code !== "whatsapp" && channel.provider !== "baileys") {
        throw new BaileysIntegrationError("Channel is not compatible with WhatsApp pairing. Expected channel code 'whatsapp' or provider 'baileys'.");
    }
    if (channel.status !== "active") {
        throw new BaileysIntegrationError("Related channel must be active to start WhatsApp pairing.");
    }
    return {
        channelAccountCode: channelAccount.code,
    };
}
async function updateChannelAccountConnectionTimestamps(options) {
    const updatePayload = {};
    if (options.connectedAt) {
        updatePayload.lastConnectedAt = options.connectedAt;
        updatePayload.status = "connected";
    }
    if (options.disconnectedAt) {
        updatePayload.lastDisconnectedAt = options.disconnectedAt;
        updatePayload.status = "disconnected";
    }
    if (Object.keys(updatePayload).length > 0) {
        await channel_account_model_1.ChannelAccountModel.updateOne({ _id: options.channelAccountId }, updatePayload).exec();
    }
}
async function clearBaileysAuthState(authFolderPath) {
    await (0, promises_1.rm)(authFolderPath, { recursive: true, force: true });
}
function cleanupManagedConnection(channelAccountId) {
    baileys_manager_1.baileysManager.clearQr(channelAccountId);
    baileys_manager_1.baileysManager.remove(channelAccountId);
}
function clearReconnectState(channelAccountId) {
    const reconnectTimer = reconnectTimers.get(channelAccountId);
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    reconnectTimers.delete(channelAccountId);
    reconnectAttempts.delete(channelAccountId);
}
async function initializeManagedConnection(options) {
    await (0, promises_1.mkdir)(options.authFolderPath, { recursive: true });
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(options.authFolderPath);
    const resolvedWebVersion = await resolveBaileysWebVersion();
    const socket = (0, baileys_1.default)({
        auth: state,
        version: resolvedWebVersion,
        browser: baileys_1.Browsers.macOS("Chrome"),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
    });
    const initialState = createConnectingState(options.channelAccountId);
    baileys_manager_1.baileysManager.set({
        channelAccountId: options.channelAccountId,
        channelAccountCode: options.channelAccountCode,
        authFolderPath: options.authFolderPath,
        socket,
        state: initialState,
    });
    bindSocketEvents({
        channelAccountId: options.channelAccountId,
        channelAccountCode: options.channelAccountCode,
        authFolderPath: options.authFolderPath,
        socket,
        saveCreds,
    });
    return initialState;
}
async function startBaileysInternal(channelAccountId, options) {
    const existingConnection = baileys_manager_1.baileysManager.get(channelAccountId);
    if (!options?.forceRebuild &&
        existingConnection &&
        (existingConnection.state.connected || existingConnection.state.status === "connecting")) {
        return existingConnection.state;
    }
    if (existingConnection) {
        cleanupManagedConnection(channelAccountId);
    }
    let channelAccountCode = options?.channelAccountCodeOverride;
    if (!isNonEmptyString(channelAccountCode)) {
        if (options?.skipValidation) {
            throw new BaileysIntegrationError("Unable to rebuild WhatsApp connection without a channel account code.", 500);
        }
        const validationResult = await validateChannelAccountAndChannel(channelAccountId);
        channelAccountCode = validationResult.channelAccountCode;
    }
    const authFolderPath = options?.authFolderPathOverride ??
        path_1.default.resolve(process.cwd(), env_1.env.baileysAuthBasePath, `${sanitizeForPath(channelAccountCode)}-${channelAccountId}`);
    return initializeManagedConnection({
        channelAccountId,
        channelAccountCode,
        authFolderPath,
    });
}
async function restartBaileysConnection(options) {
    if (pendingStartOperations.has(options.channelAccountId)) {
        return;
    }
    const restartPromise = startBaileysInternal(options.channelAccountId, {
        forceRebuild: true,
        skipValidation: true,
        channelAccountCodeOverride: options.channelAccountCode,
        authFolderPathOverride: options.authFolderPath,
    });
    pendingStartOperations.set(options.channelAccountId, restartPromise);
    try {
        await restartPromise;
    }
    catch (error) {
        console.warn(`[baileys] restart failed channelAccountId=${options.channelAccountId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    finally {
        pendingStartOperations.delete(options.channelAccountId);
    }
}
function scheduleBaileysReconnect(options) {
    if (pendingStartOperations.has(options.channelAccountId) || reconnectTimers.has(options.channelAccountId)) {
        return;
    }
    const nextAttempt = (reconnectAttempts.get(options.channelAccountId) ?? 0) + 1;
    reconnectAttempts.set(options.channelAccountId, nextAttempt);
    const reconnectDelay = options.immediate
        ? 500
        : Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);
    console.log(`[baileys] scheduling reconnect account=${options.channelAccountId} attempt=${nextAttempt} delayMs=${reconnectDelay} reason=${options.reason}`);
    const timer = setTimeout(() => {
        reconnectTimers.delete(options.channelAccountId);
        void restartBaileysConnection({
            channelAccountId: options.channelAccountId,
            channelAccountCode: options.channelAccountCode,
            authFolderPath: options.authFolderPath,
        });
    }, reconnectDelay);
    reconnectTimers.set(options.channelAccountId, timer);
}
async function handleIncomingInterestReply(options) {
    if (options.message.key?.fromMe) {
        return;
    }
    const channelUserRef = options.message.key?.remoteJid;
    if (!isNonEmptyString(channelUserRef) || shouldIgnoreIncomingJid(channelUserRef)) {
        return;
    }
    const incomingText = extractIncomingMessageText(options.message);
    if (!incomingText) {
        return;
    }
    const incomingDisplayName = getIncomingDisplayName(options.message);
    const trigger = await (0, interested_lead_service_1.detectInterestedReplyForContact)({
        channelAccountId: options.channelAccountId,
        channelUserRef,
        displayName: incomingDisplayName,
        message: incomingText,
    });
    if (!trigger) {
        return;
    }
    const { shouldSendAcknowledgement } = await (0, interested_lead_service_1.recordInterestedLead)({
        channelAccountId: options.channelAccountId,
        channelUserRef,
        displayName: incomingDisplayName,
        message: incomingText,
        trigger,
    });
    if (!shouldSendAcknowledgement) {
        return;
    }
    try {
        await options.socket.sendMessage(channelUserRef, {
            text: interested_lead_service_1.INTEREST_ACKNOWLEDGEMENT_MESSAGE,
        });
        await (0, interested_lead_service_1.markInterestedLeadAcknowledged)({
            channelAccountId: options.channelAccountId,
            channelUserRef,
            sentAt: new Date(),
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send acknowledgement.";
        await (0, interested_lead_service_1.markInterestedLeadAcknowledgementFailed)({
            channelAccountId: options.channelAccountId,
            channelUserRef,
            errorMessage,
        });
        console.warn(`[baileys] interest acknowledgement failed account=${options.channelAccountId} user=${channelUserRef}: ${errorMessage}`);
    }
}
function bindSocketEvents(options) {
    const { channelAccountId, channelAccountCode, authFolderPath, socket, saveCreds } = options;
    socket.ev.on("creds.update", async () => {
        await saveCreds();
    });
    socket.ev.on("connection.update", (update) => {
        void (async () => {
            const timestamp = new Date().toISOString();
            const disconnectStatusCode = readDisconnectStatusCode(update);
            if (isNonEmptyString(update.qr)) {
                baileys_manager_1.baileysManager.setQr(channelAccountId, update.qr.trim());
            }
            if (update.connection === "open") {
                clearReconnectState(channelAccountId);
                baileys_manager_1.baileysManager.clearQr(channelAccountId);
                baileys_manager_1.baileysManager.updateState(channelAccountId, (state) => ({
                    ...state,
                    initialized: true,
                    connected: true,
                    status: "connected",
                    qrAvailable: false,
                    lastErrorMessage: null,
                    lastConnectionUpdate: timestamp,
                    phoneNumber: extractPhoneNumber(socket),
                }));
                void updateChannelAccountConnectionTimestamps({
                    channelAccountId,
                    connectedAt: new Date(),
                });
                return;
            }
            if (update.connection === "connecting" || isNonEmptyString(update.qr)) {
                baileys_manager_1.baileysManager.updateState(channelAccountId, (state) => ({
                    ...state,
                    initialized: true,
                    connected: false,
                    status: "connecting",
                    qrAvailable: isNonEmptyString(update.qr) || state.qrAvailable,
                    lastErrorMessage: null,
                    lastConnectionUpdate: timestamp,
                }));
                return;
            }
            if (update.connection !== "close") {
                return;
            }
            if (disconnectStatusCode === baileys_1.DisconnectReason.restartRequired ||
                disconnectStatusCode === 515) {
                baileys_manager_1.baileysManager.clearQr(channelAccountId);
                baileys_manager_1.baileysManager.updateState(channelAccountId, (state) => ({
                    ...state,
                    initialized: true,
                    connected: false,
                    status: "connecting",
                    qrAvailable: false,
                    lastErrorMessage: null,
                    lastConnectionUpdate: timestamp,
                }));
                scheduleBaileysReconnect({
                    channelAccountId,
                    channelAccountCode,
                    authFolderPath,
                    reason: `restart_required_${disconnectStatusCode}`,
                    immediate: true,
                });
                return;
            }
            if (disconnectStatusCode === baileys_1.DisconnectReason.connectionReplaced) {
                clearReconnectState(channelAccountId);
                baileys_manager_1.baileysManager.clearQr(channelAccountId);
                baileys_manager_1.baileysManager.updateState(channelAccountId, (state) => ({
                    ...state,
                    initialized: true,
                    connected: false,
                    status: "disconnected",
                    qrAvailable: false,
                    lastErrorMessage: getDisconnectMessage(disconnectStatusCode),
                    lastConnectionUpdate: timestamp,
                    phoneNumber: state.phoneNumber ?? extractPhoneNumber(socket),
                }));
                void updateChannelAccountConnectionTimestamps({
                    channelAccountId,
                    disconnectedAt: new Date(),
                });
                return;
            }
            if (disconnectStatusCode === baileys_1.DisconnectReason.loggedOut || disconnectStatusCode === 401) {
                clearReconnectState(channelAccountId);
                cleanupManagedConnection(channelAccountId);
                await clearBaileysAuthState(authFolderPath);
                void updateChannelAccountConnectionTimestamps({
                    channelAccountId,
                    disconnectedAt: new Date(),
                });
                return;
            }
            baileys_manager_1.baileysManager.clearQr(channelAccountId);
            baileys_manager_1.baileysManager.updateState(channelAccountId, (state) => ({
                ...state,
                initialized: true,
                connected: false,
                status: "connecting",
                qrAvailable: false,
                lastErrorMessage: getDisconnectMessage(disconnectStatusCode),
                lastConnectionUpdate: timestamp,
            }));
            scheduleBaileysReconnect({
                channelAccountId,
                channelAccountCode,
                authFolderPath,
                reason: `connection_close_${disconnectStatusCode ?? "unknown"}`,
            });
        })().catch((error) => {
            console.warn(`[baileys] connection lifecycle error channelAccountId=${channelAccountId}: ${error instanceof Error ? error.message : "unknown error"}`);
        });
    });
    socket.ev.on("messages.upsert", (event) => {
        const messages = Array.isArray(event.messages) ? event.messages : [];
        for (const message of messages) {
            void handleIncomingInterestReply({
                channelAccountId,
                socket,
                message,
            }).catch((error) => {
                console.warn(`[baileys] interest reply handling failed account=${channelAccountId}: ${error instanceof Error ? error.message : "unknown error"}`);
            });
        }
    });
}
async function sendBaileysTextMessage(channelAccountIdValue, channelUserRefValue, textValue) {
    const channelAccountId = parseChannelAccountId(channelAccountIdValue);
    if (!isNonEmptyString(channelUserRefValue)) {
        throw new BaileysIntegrationError("Field 'channelUserRef' is required.");
    }
    if (!isNonEmptyString(textValue)) {
        throw new BaileysIntegrationError("Field 'text' is required.");
    }
    const managedConnection = baileys_manager_1.baileysManager.get(channelAccountId);
    if (!managedConnection) {
        throw new BaileysIntegrationError("WhatsApp connection is not initialized for this channel account.", 409);
    }
    if (!managedConnection.state.connected) {
        throw new BaileysIntegrationError(managedConnection.state.lastErrorMessage ??
            "WhatsApp connection is not connected for this channel account.", 409);
    }
    await managedConnection.socket.sendMessage(channelUserRefValue.trim(), {
        text: textValue.trim(),
    });
}
async function startBaileys(channelAccountIdValue) {
    const channelAccountId = parseChannelAccountId(channelAccountIdValue);
    const existingPendingStart = pendingStartOperations.get(channelAccountId);
    if (existingPendingStart) {
        return existingPendingStart;
    }
    clearReconnectState(channelAccountId);
    const startPromise = startBaileysInternal(channelAccountId);
    pendingStartOperations.set(channelAccountId, startPromise);
    try {
        return await startPromise;
    }
    finally {
        pendingStartOperations.delete(channelAccountId);
    }
}
function getBaileysStatus(channelAccountIdValue) {
    const channelAccountId = parseChannelAccountId(channelAccountIdValue);
    return baileys_manager_1.baileysManager.getState(channelAccountId) ?? createNotInitializedState(channelAccountId);
}
function getBaileysQr(channelAccountIdValue) {
    const channelAccountId = parseChannelAccountId(channelAccountIdValue);
    const qr = baileys_manager_1.baileysManager.getQr(channelAccountId);
    return createQrResult(channelAccountId, qr);
}
async function restoreConnectedBaileysAccounts() {
    const baileysChannels = await channel_model_1.ChannelModel.find({
        status: "active",
        $or: [{ code: "whatsapp" }, { provider: "baileys" }],
    })
        .select("_id")
        .lean();
    if (baileysChannels.length === 0) {
        return;
    }
    const connectedAccounts = await channel_account_model_1.ChannelAccountModel.find({
        status: "connected",
        channelId: { $in: baileysChannels.map((channel) => channel._id) },
    })
        .select("_id code")
        .lean();
    for (const account of connectedAccounts) {
        try {
            await startBaileys(String(account._id));
        }
        catch (error) {
            console.warn(`[baileys] startup restore failed account=${String(account._id)} code=${account.code ?? "unknown"}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }
}
async function logoutBaileys(channelAccountIdValue) {
    const channelAccountId = parseChannelAccountId(channelAccountIdValue);
    const managedConnection = baileys_manager_1.baileysManager.get(channelAccountId);
    clearReconnectState(channelAccountId);
    if (!managedConnection) {
        return createNotInitializedState(channelAccountId);
    }
    try {
        await managedConnection.socket.logout();
    }
    catch (error) {
        console.warn(`[baileys] logout warning channelAccountId=${channelAccountId}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    const disconnectedAt = new Date();
    const result = {
        channelAccountId,
        initialized: false,
        connected: false,
        status: "disconnected",
        lastConnectionUpdate: disconnectedAt.toISOString(),
        lastErrorMessage: null,
        qrAvailable: false,
        phoneNumber: managedConnection.state.phoneNumber,
    };
    cleanupManagedConnection(channelAccountId);
    await clearBaileysAuthState(managedConnection.authFolderPath);
    void updateChannelAccountConnectionTimestamps({
        channelAccountId,
        disconnectedAt,
    });
    return result;
}
function isBaileysIntegrationError(error) {
    return error instanceof BaileysIntegrationError;
}
