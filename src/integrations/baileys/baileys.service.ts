import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  type ConnectionState,
  type WASocket,
  type WAVersion,
  type WAMessage,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { mkdir, rm } from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { env } from "../../config/env";
import { ChannelAccountModel } from "../../modules/channel-accounts/channel-account.model";
import { ChannelModel } from "../../modules/channels/channel.model";
import {
  detectInterestedReplyForContact,
  INTEREST_ACKNOWLEDGEMENT_MESSAGE,
  markInterestedLeadAcknowledged,
  markInterestedLeadAcknowledgementFailed,
  recordInterestedLead,
} from "../../modules/interested-leads/interested-lead.service";
import { baileysManager } from "./baileys.manager";
import {
  BaileysConnectionState,
  BaileysQrResult,
  LogoutBaileysResult,
  StartBaileysResult,
} from "./baileys.types";

class BaileysIntegrationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BaileysIntegrationError";
    this.statusCode = statusCode;
  }
}

const pendingStartOperations = new Map<string, Promise<StartBaileysResult>>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const reconnectAttempts = new Map<string, number>();
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseChannelAccountId(channelAccountId: unknown): string {
  const normalizedValue =
    typeof channelAccountId === "string"
      ? channelAccountId.trim()
      : channelAccountId instanceof mongoose.Types.ObjectId
        ? channelAccountId.toString()
        : "";

  if (!normalizedValue) {
    throw new BaileysIntegrationError("Field 'channelAccountId' is required.");
  }

  if (!mongoose.isValidObjectId(normalizedValue)) {
    throw new BaileysIntegrationError("Field 'channelAccountId' must be a valid ObjectId.");
  }

  return normalizedValue;
}

function sanitizeForPath(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function createNotInitializedState(channelAccountId: string): BaileysConnectionState {
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

function createConnectingState(
  channelAccountId: string,
  phoneNumber: string | null = null
): BaileysConnectionState {
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

function createQrResult(channelAccountId: string, qr: string | null): BaileysQrResult {
  return {
    channelAccountId,
    qr,
  };
}

function extractPhoneNumber(socket: WASocket): string | null {
  const maybeSocketUserId = socket.user?.id;
  if (!isNonEmptyString(maybeSocketUserId)) {
    return null;
  }

  return maybeSocketUserId.split("@")[0] || null;
}

function readDisconnectStatusCode(update: Partial<ConnectionState>): number | undefined {
  const maybeError = update.lastDisconnect?.error as
    | { output?: { statusCode?: number } }
    | undefined;
  return maybeError?.output?.statusCode;
}

function getDisconnectMessage(statusCode: number | undefined): string {
  switch (statusCode) {
    case DisconnectReason.connectionReplaced:
      return "WhatsApp replaced this linked-device session. Close the other active WhatsApp Web session, then start pairing again.";
    case DisconnectReason.loggedOut:
      return "WhatsApp logged this device out. Pair the account again to continue.";
    case DisconnectReason.multideviceMismatch:
      return "WhatsApp rejected this session because multi-device support is not available for the account.";
    case DisconnectReason.forbidden:
      return "WhatsApp rejected this session. Check the linked account and pair again.";
    case DisconnectReason.badSession:
      return "WhatsApp session data is invalid. Log out, clear the pairing, and scan a new QR code.";
    default:
      return statusCode
        ? `WhatsApp connection closed with code ${statusCode}.`
        : "WhatsApp connection closed unexpectedly.";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringProperty(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return isNonEmptyString(value) ? value.trim() : null;
}

function extractTextFromMessageContent(value: unknown, depth = 0): string | null {
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

  const nestedTextKeys: Array<[string, string[]]> = [
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
  const listReplyText =
    getStringProperty(listResponseMessage ?? {}, "title") ??
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

function extractIncomingMessageText(message: WAMessage): string | null {
  return extractTextFromMessageContent(message.message);
}

function shouldIgnoreIncomingJid(channelUserRef: string): boolean {
  return (
    channelUserRef === "status@broadcast" ||
    channelUserRef.endsWith("@broadcast") ||
    channelUserRef.endsWith("@g.us")
  );
}

function getIncomingDisplayName(message: WAMessage): string | undefined {
  const pushName = (message as { pushName?: unknown }).pushName;
  return isNonEmptyString(pushName) ? pushName.trim().slice(0, 140) : undefined;
}

async function resolveBaileysWebVersion(): Promise<WAVersion | undefined> {
  try {
    const result = await fetchLatestWaWebVersion();
    const resolvedVersion = Array.isArray(result.version) ? result.version : undefined;

    if (
      resolvedVersion &&
      resolvedVersion.length === 3 &&
      resolvedVersion.every((part) => typeof part === "number" && Number.isFinite(part))
    ) {
      return resolvedVersion as WAVersion;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function validateChannelAccountAndChannel(channelAccountId: string): Promise<{
  channelAccountCode: string;
}> {
  const channelAccount = await ChannelAccountModel.findById(channelAccountId).lean();
  if (!channelAccount) {
    throw new BaileysIntegrationError("Channel account not found.", 404);
  }

  if (channelAccount.status === "blocked") {
    throw new BaileysIntegrationError("Channel account is blocked and cannot be started.");
  }

  const channel = await ChannelModel.findById(channelAccount.channelId).lean();
  if (!channel) {
    throw new BaileysIntegrationError("Related channel not found.", 404);
  }

  if (channel.code !== "whatsapp" && channel.provider !== "baileys") {
    throw new BaileysIntegrationError(
      "Channel is not compatible with WhatsApp pairing. Expected channel code 'whatsapp' or provider 'baileys'."
    );
  }

  if (channel.status !== "active") {
    throw new BaileysIntegrationError("Related channel must be active to start WhatsApp pairing.");
  }

  return {
    channelAccountCode: channelAccount.code,
  };
}

async function updateChannelAccountConnectionTimestamps(options: {
  channelAccountId: string;
  connectedAt?: Date;
  disconnectedAt?: Date;
}): Promise<void> {
  const updatePayload: Record<string, unknown> = {};

  if (options.connectedAt) {
    updatePayload.lastConnectedAt = options.connectedAt;
    updatePayload.status = "connected";
  }

  if (options.disconnectedAt) {
    updatePayload.lastDisconnectedAt = options.disconnectedAt;
    updatePayload.status = "disconnected";
  }

  if (Object.keys(updatePayload).length > 0) {
    await ChannelAccountModel.updateOne({ _id: options.channelAccountId }, updatePayload).exec();
  }
}

async function clearBaileysAuthState(authFolderPath: string): Promise<void> {
  await rm(authFolderPath, { recursive: true, force: true });
}

function cleanupManagedConnection(channelAccountId: string): void {
  baileysManager.clearQr(channelAccountId);
  baileysManager.remove(channelAccountId);
}

function clearReconnectState(channelAccountId: string): void {
  const reconnectTimer = reconnectTimers.get(channelAccountId);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  reconnectTimers.delete(channelAccountId);
  reconnectAttempts.delete(channelAccountId);
}

async function initializeManagedConnection(options: {
  channelAccountId: string;
  channelAccountCode: string;
  authFolderPath: string;
}): Promise<StartBaileysResult> {
  await mkdir(options.authFolderPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(options.authFolderPath);
  const resolvedWebVersion = await resolveBaileysWebVersion();

  const socket = makeWASocket({
    auth: state,
    version: resolvedWebVersion,
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });

  const initialState = createConnectingState(options.channelAccountId);

  baileysManager.set({
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

async function startBaileysInternal(
  channelAccountId: string,
  options?: {
    forceRebuild?: boolean;
    authFolderPathOverride?: string;
    channelAccountCodeOverride?: string;
    skipValidation?: boolean;
  }
): Promise<StartBaileysResult> {
  const existingConnection = baileysManager.get(channelAccountId);
  if (
    !options?.forceRebuild &&
    existingConnection &&
    (existingConnection.state.connected || existingConnection.state.status === "connecting")
  ) {
    return existingConnection.state;
  }

  if (existingConnection) {
    cleanupManagedConnection(channelAccountId);
  }

  let channelAccountCode = options?.channelAccountCodeOverride;
  if (!isNonEmptyString(channelAccountCode)) {
    if (options?.skipValidation) {
      throw new BaileysIntegrationError(
        "Unable to rebuild WhatsApp connection without a channel account code.",
        500
      );
    }

    const validationResult = await validateChannelAccountAndChannel(channelAccountId);
    channelAccountCode = validationResult.channelAccountCode;
  }

  const authFolderPath =
    options?.authFolderPathOverride ??
    path.resolve(
      process.cwd(),
      env.baileysAuthBasePath,
      `${sanitizeForPath(channelAccountCode)}-${channelAccountId}`
    );

  return initializeManagedConnection({
    channelAccountId,
    channelAccountCode,
    authFolderPath,
  });
}

async function restartBaileysConnection(options: {
  channelAccountId: string;
  channelAccountCode: string;
  authFolderPath: string;
}): Promise<void> {
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
  } catch (error) {
    console.warn(
      `[baileys] restart failed channelAccountId=${options.channelAccountId}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  } finally {
    pendingStartOperations.delete(options.channelAccountId);
  }
}

function scheduleBaileysReconnect(options: {
  channelAccountId: string;
  channelAccountCode: string;
  authFolderPath: string;
  reason: string;
  immediate?: boolean;
}): void {
  if (pendingStartOperations.has(options.channelAccountId) || reconnectTimers.has(options.channelAccountId)) {
    return;
  }

  const nextAttempt = (reconnectAttempts.get(options.channelAccountId) ?? 0) + 1;
  reconnectAttempts.set(options.channelAccountId, nextAttempt);

  const reconnectDelay = options.immediate
    ? 500
    : Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);

  console.log(
    `[baileys] scheduling reconnect account=${options.channelAccountId} attempt=${nextAttempt} delayMs=${reconnectDelay} reason=${options.reason}`
  );

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

async function handleIncomingInterestReply(options: {
  channelAccountId: string;
  socket: WASocket;
  message: WAMessage;
}): Promise<void> {
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
  const trigger = await detectInterestedReplyForContact({
    channelAccountId: options.channelAccountId,
    channelUserRef,
    displayName: incomingDisplayName,
    message: incomingText,
  });
  if (!trigger) {
    return;
  }

  const { shouldSendAcknowledgement } = await recordInterestedLead({
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
      text: INTEREST_ACKNOWLEDGEMENT_MESSAGE,
    });
    await markInterestedLeadAcknowledged({
      channelAccountId: options.channelAccountId,
      channelUserRef,
      sentAt: new Date(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to send acknowledgement.";
    await markInterestedLeadAcknowledgementFailed({
      channelAccountId: options.channelAccountId,
      channelUserRef,
      errorMessage,
    });
    console.warn(
      `[baileys] interest acknowledgement failed account=${options.channelAccountId} user=${channelUserRef}: ${errorMessage}`
    );
  }
}

function bindSocketEvents(options: {
  channelAccountId: string;
  channelAccountCode: string;
  authFolderPath: string;
  socket: WASocket;
  saveCreds: () => Promise<void>;
}): void {
  const { channelAccountId, channelAccountCode, authFolderPath, socket, saveCreds } = options;

  socket.ev.on("creds.update", async () => {
    await saveCreds();
  });

  socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
    void (async () => {
      const timestamp = new Date().toISOString();
      const disconnectStatusCode = readDisconnectStatusCode(update);

      if (isNonEmptyString(update.qr)) {
        baileysManager.setQr(channelAccountId, update.qr.trim());
      }

      if (update.connection === "open") {
        clearReconnectState(channelAccountId);
        baileysManager.clearQr(channelAccountId);
        baileysManager.updateState(channelAccountId, (state) => ({
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
        baileysManager.updateState(channelAccountId, (state) => ({
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

      if (
        disconnectStatusCode === DisconnectReason.restartRequired ||
        disconnectStatusCode === 515
      ) {
        baileysManager.clearQr(channelAccountId);
        baileysManager.updateState(channelAccountId, (state) => ({
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

      if (disconnectStatusCode === DisconnectReason.connectionReplaced) {
        clearReconnectState(channelAccountId);
        baileysManager.clearQr(channelAccountId);
        baileysManager.updateState(channelAccountId, (state) => ({
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

      if (disconnectStatusCode === DisconnectReason.loggedOut || disconnectStatusCode === 401) {
        clearReconnectState(channelAccountId);
        cleanupManagedConnection(channelAccountId);
        await clearBaileysAuthState(authFolderPath);

        void updateChannelAccountConnectionTimestamps({
          channelAccountId,
          disconnectedAt: new Date(),
        });
        return;
      }

      baileysManager.clearQr(channelAccountId);
      baileysManager.updateState(channelAccountId, (state) => ({
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
      console.warn(
        `[baileys] connection lifecycle error channelAccountId=${channelAccountId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    });
  });

  socket.ev.on("messages.upsert", (event: { messages?: WAMessage[] }) => {
    const messages = Array.isArray(event.messages) ? event.messages : [];

    for (const message of messages) {
      void handleIncomingInterestReply({
        channelAccountId,
        socket,
        message,
      }).catch((error) => {
        console.warn(
          `[baileys] interest reply handling failed account=${channelAccountId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      });
    }
  });
}

export async function sendBaileysTextMessage(
  channelAccountIdValue: unknown,
  channelUserRefValue: unknown,
  textValue: unknown
): Promise<void> {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  if (!isNonEmptyString(channelUserRefValue)) {
    throw new BaileysIntegrationError("Field 'channelUserRef' is required.");
  }

  if (!isNonEmptyString(textValue)) {
    throw new BaileysIntegrationError("Field 'text' is required.");
  }

  const managedConnection = baileysManager.get(channelAccountId);
  if (!managedConnection) {
    throw new BaileysIntegrationError(
      "WhatsApp connection is not initialized for this channel account.",
      409
    );
  }

  if (!managedConnection.state.connected) {
    throw new BaileysIntegrationError(
      managedConnection.state.lastErrorMessage ??
        "WhatsApp connection is not connected for this channel account.",
      409
    );
  }

  await managedConnection.socket.sendMessage(channelUserRefValue.trim(), {
    text: textValue.trim(),
  });
}

export async function startBaileys(channelAccountIdValue: unknown): Promise<StartBaileysResult> {
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
  } finally {
    pendingStartOperations.delete(channelAccountId);
  }
}

export function getBaileysStatus(channelAccountIdValue: unknown): BaileysConnectionState {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  return baileysManager.getState(channelAccountId) ?? createNotInitializedState(channelAccountId);
}

export function getBaileysQr(channelAccountIdValue: unknown): BaileysQrResult {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  const qr = baileysManager.getQr(channelAccountId);
  return createQrResult(channelAccountId, qr);
}

export async function restoreConnectedBaileysAccounts(): Promise<void> {
  const baileysChannels = await ChannelModel.find({
    status: "active",
    $or: [{ code: "whatsapp" }, { provider: "baileys" }],
  })
    .select("_id")
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();

  if (baileysChannels.length === 0) {
    return;
  }

  const connectedAccounts = await ChannelAccountModel.find({
    status: "connected",
    channelId: { $in: baileysChannels.map((channel) => channel._id) },
  })
    .select("_id code")
    .lean<Array<{ _id: mongoose.Types.ObjectId; code?: string }>>();

  for (const account of connectedAccounts) {
    try {
      await startBaileys(String(account._id));
    } catch (error) {
      console.warn(
        `[baileys] startup restore failed account=${String(account._id)} code=${
          account.code ?? "unknown"
        }: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }
}

export async function logoutBaileys(channelAccountIdValue: unknown): Promise<LogoutBaileysResult> {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  const managedConnection = baileysManager.get(channelAccountId);

  clearReconnectState(channelAccountId);

  if (!managedConnection) {
    return createNotInitializedState(channelAccountId);
  }

  try {
    await managedConnection.socket.logout();
  } catch (error) {
    console.warn(
      `[baileys] logout warning channelAccountId=${channelAccountId}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  const disconnectedAt = new Date();
  const result: LogoutBaileysResult = {
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

export function isBaileysIntegrationError(error: unknown): error is BaileysIntegrationError {
  return error instanceof BaileysIntegrationError;
}
