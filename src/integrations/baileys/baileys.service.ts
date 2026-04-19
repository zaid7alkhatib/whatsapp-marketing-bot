import makeWASocket, {
  DisconnectReason,
  type ConnectionState,
  type WAMessage,
  type WASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { mkdir } from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { env } from "../../config/env";
import { ChannelAccountModel } from "../../modules/channel-accounts/channel-account.model";
import { ChannelModel } from "../../modules/channels/channel.model";
import { isRuntimeError, inboundMessage } from "../../modules/runtime/runtime.service";
import { RuntimeInboundMessageBody, RuntimeInboundMessageResult } from "../../modules/runtime/runtime.types";
import { baileysManager } from "./baileys.manager";
import {
  BaileysConnectionState,
  LogoutBaileysResult,
  NormalizedIncomingWhatsAppMessage,
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseChannelAccountId(channelAccountId: unknown): string {
  if (!isNonEmptyString(channelAccountId)) {
    throw new BaileysIntegrationError("Field 'channelAccountId' is required.");
  }

  const normalizedValue = channelAccountId.trim();
  if (!mongoose.isValidObjectId(normalizedValue)) {
    throw new BaileysIntegrationError("Field 'channelAccountId' must be a valid ObjectId.");
  }

  return normalizedValue;
}

function sanitizeForPath(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.replace(/[^a-z0-9_-]/g, "_");
}

function createNotInitializedState(channelAccountId: string): BaileysConnectionState {
  return {
    channelAccountId,
    initialized: false,
    connected: false,
    status: "not_initialized",
    lastConnectionUpdate: null,
    qrAvailable: false,
    phoneNumber: null,
  };
}

function extractPhoneNumber(socket: WASocket): string | null {
  const maybeSocketUserId = socket.user?.id;
  if (!isNonEmptyString(maybeSocketUserId)) {
    return null;
  }

  return maybeSocketUserId.split("@")[0] || null;
}

function extractTextMessage(message: WAMessage): string | undefined {
  const messageContent = (message.message ?? {}) as {
    conversation?: unknown;
    extendedTextMessage?: {
      text?: unknown;
    };
  };

  if (isNonEmptyString(messageContent.conversation)) {
    return messageContent.conversation.trim();
  }

  if (isNonEmptyString(messageContent.extendedTextMessage?.text)) {
    return messageContent.extendedTextMessage.text.trim();
  }

  return undefined;
}

function getConfigString(
  config: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = config[key];
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }

  return undefined;
}

function resolveRuntimeDefaultsFromProviderConfig(
  providerConfig: Record<string, unknown>
): {
  flowId?: string;
  language?: string;
  orgUnitId?: string;
  businessPartnerId?: string;
} {
  return {
    flowId: getConfigString(providerConfig, ["runtimeFlowId", "defaultFlowId", "flowId"]),
    language: getConfigString(providerConfig, ["runtimeLanguage", "defaultLanguage", "language"]),
    orgUnitId: getConfigString(providerConfig, ["runtimeOrgUnitId", "defaultOrgUnitId", "orgUnitId"]),
    businessPartnerId: getConfigString(providerConfig, [
      "runtimeBusinessPartnerId",
      "defaultBusinessPartnerId",
      "businessPartnerId",
    ]),
  };
}

function collectOutboundTexts(runtimeResult: RuntimeInboundMessageResult): string[] {
  const outboundTexts: string[] = [];

  const createdMessages = runtimeResult.processResult?.createdOutboundMessages ?? [];
  for (const message of createdMessages) {
    if (isNonEmptyString(message.text)) {
      outboundTexts.push(message.text.trim());
    }
  }

  if (
    runtimeResult.sessionCreated &&
    runtimeResult.startSession &&
    runtimeResult.startSession.createdOutboundMessageId &&
    isNonEmptyString(runtimeResult.startSession.currentContent)
  ) {
    outboundTexts.push(runtimeResult.startSession.currentContent.trim());
  }

  return outboundTexts;
}

async function sendOutboundWhatsAppTexts(
  channelAccountId: string,
  channelUserRef: string,
  texts: string[]
): Promise<void> {
  if (texts.length === 0) {
    return;
  }

  const managedConnection = baileysManager.get(channelAccountId);
  if (!managedConnection) {
    console.warn(
      `[baileys] cannot send outbound messages; connection not initialized. account=${channelAccountId}`
    );
    return;
  }

  for (const text of texts) {
    if (!isNonEmptyString(text)) {
      continue;
    }

    try {
      await managedConnection.socket.sendMessage(channelUserRef, { text });
      console.log(
        `[baileys] outbound text sent account=${channelAccountId} user=${channelUserRef}`
      );
    } catch (error) {
      console.warn(
        `[baileys] failed to send outbound text account=${channelAccountId} user=${channelUserRef}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }
}

async function handleIncomingWhatsAppMessage(payload: NormalizedIncomingWhatsAppMessage): Promise<void> {
  console.log(
    `[baileys] incoming text received account=${payload.channelAccountId} user=${payload.channelUserRef}`
  );

  try {
    const channelAccount = await ChannelAccountModel.findById(payload.channelAccountId)
      .select("providerConfig")
      .lean();

    if (!channelAccount) {
      console.warn(
        `[baileys] incoming message ignored; channel account not found. account=${payload.channelAccountId}`
      );
      return;
    }

    const providerConfig =
      channelAccount.providerConfig && typeof channelAccount.providerConfig === "object"
        ? (channelAccount.providerConfig as Record<string, unknown>)
        : {};
    const runtimeDefaults = resolveRuntimeDefaultsFromProviderConfig(providerConfig);

    const runtimePayload: RuntimeInboundMessageBody = {
      channelAccountId: payload.channelAccountId,
      channelUserRef: payload.channelUserRef,
      messageType: payload.messageType,
      text: payload.text,
      externalMessageId: payload.externalMessageId,
      flowId: runtimeDefaults.flowId,
      language: runtimeDefaults.language,
      orgUnitId: runtimeDefaults.orgUnitId,
      businessPartnerId: runtimeDefaults.businessPartnerId,
    };

    const runtimeResult = await inboundMessage(runtimePayload);
    console.log(
      `[baileys] runtime processed account=${payload.channelAccountId} user=${payload.channelUserRef} sessionId=${runtimeResult.sessionId} sessionCreated=${runtimeResult.sessionCreated} status=${runtimeResult.sessionStatus}`
    );

    const outboundTexts = collectOutboundTexts(runtimeResult);
    await sendOutboundWhatsAppTexts(payload.channelAccountId, payload.channelUserRef, outboundTexts);
  } catch (error) {
    if (isRuntimeError(error)) {
      console.warn(
        `[baileys] runtime processing failed account=${payload.channelAccountId} user=${payload.channelUserRef}: ${error.message}`
      );
      return;
    }

    console.warn(
      `[baileys] incoming bridge failed account=${payload.channelAccountId} user=${payload.channelUserRef}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
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

  const isCompatibleCode = channel.code === "whatsapp";
  const isCompatibleProvider = channel.provider === "baileys";
  if (!isCompatibleCode && !isCompatibleProvider) {
    throw new BaileysIntegrationError(
      "Channel is not compatible with Baileys. Expected channel code 'whatsapp' or provider 'baileys'."
    );
  }

  if (channel.status !== "active") {
    throw new BaileysIntegrationError("Related channel must be active to start Baileys.");
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

  if (Object.keys(updatePayload).length === 0) {
    return;
  }

  await ChannelAccountModel.updateOne({ _id: options.channelAccountId }, updatePayload).exec();
}

function readDisconnectStatusCode(update: Partial<ConnectionState>): number | undefined {
  const maybeError = update.lastDisconnect?.error as
    | { output?: { statusCode?: number } }
    | undefined;
  return maybeError?.output?.statusCode;
}

function bindSocketEvents(channelAccountId: string, socket: WASocket, saveCreds: () => Promise<void>): void {
  socket.ev.on("creds.update", async () => {
    await saveCreds();
  });

  socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
    const timestamp = new Date().toISOString();
    const disconnectStatusCode = readDisconnectStatusCode(update);

    if (update.connection === "open") {
      console.log(`[baileys] channelAccountId=${channelAccountId} connection=open`);
      baileysManager.updateState(channelAccountId, (state) => ({
        ...state,
        initialized: true,
        connected: true,
        status: "connected",
        qrAvailable: false,
        lastConnectionUpdate: timestamp,
        phoneNumber: extractPhoneNumber(socket),
      }));

      void updateChannelAccountConnectionTimestamps({
        channelAccountId,
        connectedAt: new Date(),
      });
      return;
    }

    if (update.connection === "connecting") {
      console.log(`[baileys] channelAccountId=${channelAccountId} connection=connecting`);
      baileysManager.updateState(channelAccountId, (state) => ({
        ...state,
        initialized: true,
        connected: false,
        status: "connecting",
        qrAvailable: isNonEmptyString(update.qr),
        lastConnectionUpdate: timestamp,
      }));
      return;
    }

    if (update.connection === "close") {
      console.log(
        `[baileys] channelAccountId=${channelAccountId} connection=close statusCode=${disconnectStatusCode ?? "unknown"}`
      );

      baileysManager.updateState(channelAccountId, (state) => ({
        ...state,
        initialized: true,
        connected: false,
        status: "disconnected",
        qrAvailable: false,
        lastConnectionUpdate: timestamp,
      }));

      void updateChannelAccountConnectionTimestamps({
        channelAccountId,
        disconnectedAt: new Date(),
      });

      if (disconnectStatusCode === DisconnectReason.loggedOut) {
        console.log(`[baileys] channelAccountId=${channelAccountId} logged out.`);
        baileysManager.remove(channelAccountId);
      }
      return;
    }

    if (isNonEmptyString(update.qr)) {
      baileysManager.updateState(channelAccountId, (state) => ({
        ...state,
        qrAvailable: true,
        lastConnectionUpdate: timestamp,
      }));
    }
  });

  socket.ev.on("messages.upsert", (event: { messages?: WAMessage[] }) => {
    const messages = Array.isArray(event.messages) ? event.messages : [];

    for (const message of messages) {
      try {
        if (message.key?.fromMe) {
          console.log(`[baileys] ignoring message from self account=${channelAccountId}`);
          continue;
        }

        if (!isNonEmptyString(message.key?.remoteJid)) {
          console.log(`[baileys] ignoring message without remoteJid account=${channelAccountId}`);
          continue;
        }

        const text = extractTextMessage(message);
        if (!isNonEmptyString(text)) {
          console.log(
            `[baileys] unsupported incoming message type ignored account=${channelAccountId} user=${message.key.remoteJid.trim()}`
          );
          continue;
        }

        void handleIncomingWhatsAppMessage({
          channelAccountId,
          channelUserRef: message.key.remoteJid.trim(),
          messageType: "text",
          text: text.trim(),
          externalMessageId: isNonEmptyString(message.key.id) ? message.key.id.trim() : undefined,
        });
      } catch (error) {
        console.warn(
          `[baileys] failed to parse incoming message account=${channelAccountId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }
  });
}

export async function startBaileys(channelAccountIdValue: unknown): Promise<StartBaileysResult> {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);

  const existingConnectionState = baileysManager.getState(channelAccountId);
  if (existingConnectionState) {
    return existingConnectionState;
  }

  const { channelAccountCode } = await validateChannelAccountAndChannel(channelAccountId);

  const authFolderPath = path.resolve(
    process.cwd(),
    env.baileysAuthBasePath,
    `${sanitizeForPath(channelAccountCode)}-${channelAccountId}`
  );
  await mkdir(authFolderPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });

  const initialState: BaileysConnectionState = {
    channelAccountId,
    initialized: true,
    connected: false,
    status: "connecting",
    lastConnectionUpdate: new Date().toISOString(),
    qrAvailable: false,
    phoneNumber: null,
  };

  baileysManager.set({
    channelAccountId,
    channelAccountCode,
    authFolderPath,
    socket,
    state: initialState,
  });

  bindSocketEvents(channelAccountId, socket, saveCreds);

  console.log(`[baileys] initialized channelAccountId=${channelAccountId}`);

  return initialState;
}

export function getBaileysStatus(channelAccountIdValue: unknown): BaileysConnectionState {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  return baileysManager.getState(channelAccountId) ?? createNotInitializedState(channelAccountId);
}

export async function logoutBaileys(channelAccountIdValue: unknown): Promise<LogoutBaileysResult> {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  const managedConnection = baileysManager.get(channelAccountId);

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
    qrAvailable: false,
    phoneNumber: managedConnection.state.phoneNumber,
  };

  baileysManager.remove(channelAccountId);

  void updateChannelAccountConnectionTimestamps({
    channelAccountId,
    disconnectedAt,
  });

  return result;
}

export function isBaileysIntegrationError(error: unknown): error is BaileysIntegrationError {
  return error instanceof BaileysIntegrationError;
}
