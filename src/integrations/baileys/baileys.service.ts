import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestWaWebVersion,
  type ConnectionState,
  type WAMessage,
  type WASocket,
  type WAVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { mkdir, rm } from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { env } from "../../config/env";
import { ChannelAccountModel } from "../../modules/channel-accounts/channel-account.model";
import { ChannelModel } from "../../modules/channels/channel.model";
import {
  isMediaIntegrationError,
  isCloudflareMediaConfigured,
  saveIncomingMediaLocally,
  uploadCloudflareImageBuffer,
} from "../../modules/media/media-cloudflare.service";
import { isRuntimeError, inboundMessage } from "../../modules/runtime/runtime.service";
import {
  RuntimeInboundMessageBody,
  RuntimeInboundMessageResult,
} from "../../modules/runtime/runtime.types";
import { baileysManager } from "./baileys.manager";
import {
  BaileysConnectionState,
  BaileysQrResult,
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

const pendingStartOperations = new Map<string, Promise<StartBaileysResult>>();

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ExtractedIncomingMessagePayload = {
  messageType: NormalizedIncomingWhatsAppMessage["messageType"];
  text?: string;
  mimeType?: string;
  fileName?: string;
};

function extractMediaCaption(messagePayload: unknown): string | undefined {
  if (!isPlainObject(messagePayload) || !isNonEmptyString(messagePayload.caption)) {
    return undefined;
  }

  return messagePayload.caption.trim();
}

function extractMediaMimeType(messagePayload: unknown): string | undefined {
  if (!isPlainObject(messagePayload) || !isNonEmptyString(messagePayload.mimetype)) {
    return undefined;
  }

  return messagePayload.mimetype.trim();
}

function extractMediaFileName(messagePayload: unknown): string | undefined {
  if (!isPlainObject(messagePayload) || !isNonEmptyString(messagePayload.fileName)) {
    return undefined;
  }

  return messagePayload.fileName.trim();
}

function extractIncomingMessagePayload(message: WAMessage): ExtractedIncomingMessagePayload | null {
  const normalizedContent = extractMessageContent(message.message) as
    | Record<string, unknown>
    | undefined;
  if (!isPlainObject(normalizedContent)) {
    return null;
  }

  if (isNonEmptyString(normalizedContent.conversation)) {
    return {
      messageType: "text",
      text: normalizedContent.conversation.trim(),
    };
  }

  if (
    isPlainObject(normalizedContent.extendedTextMessage) &&
    isNonEmptyString(normalizedContent.extendedTextMessage.text)
  ) {
    return {
      messageType: "text",
      text: normalizedContent.extendedTextMessage.text.trim(),
    };
  }

  if (isPlainObject(normalizedContent.imageMessage)) {
    return {
      messageType: "image",
      text: extractMediaCaption(normalizedContent.imageMessage),
      mimeType: extractMediaMimeType(normalizedContent.imageMessage),
      fileName: extractMediaFileName(normalizedContent.imageMessage),
    };
  }

  if (isPlainObject(normalizedContent.videoMessage)) {
    return {
      messageType: "video",
      text: extractMediaCaption(normalizedContent.videoMessage),
      mimeType: extractMediaMimeType(normalizedContent.videoMessage),
      fileName: extractMediaFileName(normalizedContent.videoMessage),
    };
  }

  if (isPlainObject(normalizedContent.audioMessage)) {
    return {
      messageType: "audio",
      mimeType: extractMediaMimeType(normalizedContent.audioMessage),
      fileName: extractMediaFileName(normalizedContent.audioMessage),
    };
  }

  if (isPlainObject(normalizedContent.documentMessage)) {
    return {
      messageType: "document",
      text: extractMediaCaption(normalizedContent.documentMessage),
      mimeType: extractMediaMimeType(normalizedContent.documentMessage),
      fileName: extractMediaFileName(normalizedContent.documentMessage),
    };
  }

  return null;
}

function isImageMimeType(mimeType: string | undefined): boolean {
  if (!isNonEmptyString(mimeType)) {
    return false;
  }

  return mimeType.trim().toLowerCase().startsWith("image/");
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

  const channelUserRef = channelUserRefValue.trim();
  const text = textValue.trim();
  const managedConnection = baileysManager.get(channelAccountId);

  if (!managedConnection) {
    throw new BaileysIntegrationError(
      "Baileys connection is not initialized for this channel account.",
      409
    );
  }

  await managedConnection.socket.sendMessage(channelUserRef, { text });
  console.log(`[baileys] outbound text sent account=${channelAccountId} user=${channelUserRef}`);
}

async function resolveIncomingMediaPayload(options: {
  socket: WASocket;
  channelAccountId: string;
  channelUserRef: string;
  message: WAMessage;
  messageType: NormalizedIncomingWhatsAppMessage["messageType"];
  externalMessageId?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<NormalizedIncomingWhatsAppMessage["media"] | undefined> {
  if (options.messageType === "text") {
    return undefined;
  }

  const canUploadToCloudflareImages =
    options.messageType === "image" || isImageMimeType(options.mimeType);

  try {
    const mediaBuffer = await downloadMediaMessage(options.message, "buffer", {});
    if (!Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
      console.warn(
        `[baileys] incoming media download returned empty buffer account=${options.channelAccountId} user=${options.channelUserRef}`
      );
      return undefined;
    }

    try {
      if (canUploadToCloudflareImages && isCloudflareMediaConfigured()) {
        const uploadedImage = await uploadCloudflareImageBuffer({
          fileBuffer: mediaBuffer,
          fileName: options.fileName,
          mimeType: options.mimeType,
          metadata: {
            source: "whatsapp",
            channelAccountId: options.channelAccountId,
            channelUserRef: options.channelUserRef,
            externalMessageId: options.externalMessageId ?? null,
            messageType: options.messageType,
          },
        });

        console.log(
          `[baileys] incoming media uploaded to cloudflare account=${options.channelAccountId} user=${options.channelUserRef} assetId=${uploadedImage.id}`
        );

        return {
          provider: "cloudflare",
          assetId: uploadedImage.id,
          url: uploadedImage.preferredUrl,
          thumbnailUrl: uploadedImage.preferredUrl,
          mimeType: uploadedImage.mimeType ?? options.mimeType,
          fileName: uploadedImage.filename ?? options.fileName,
        };
      }

      const localMedia = await saveIncomingMediaLocally({
        fileBuffer: mediaBuffer,
        fileName: options.fileName,
        mimeType: options.mimeType,
      });

      console.log(
        `[baileys] incoming media stored locally account=${options.channelAccountId} user=${options.channelUserRef} assetId=${localMedia.assetId}`
      );

      return {
        provider: "local",
        assetId: localMedia.assetId,
        url: localMedia.url,
        thumbnailUrl: localMedia.url,
        mimeType: localMedia.mimeType ?? options.mimeType,
        fileName: localMedia.fileName ?? options.fileName,
      };
    } catch (error) {
      if (!isMediaIntegrationError(error)) {
        throw error;
      }

      const localMedia = await saveIncomingMediaLocally({
        fileBuffer: mediaBuffer,
        fileName: options.fileName,
        mimeType: options.mimeType,
      });

      console.warn(
        `[baileys] incoming media upload failed; stored locally instead account=${options.channelAccountId} user=${options.channelUserRef} assetId=${localMedia.assetId} reason=${error.message}`
      );

      return {
        provider: "local",
        assetId: localMedia.assetId,
        url: localMedia.url,
        thumbnailUrl: localMedia.url,
        mimeType: localMedia.mimeType ?? options.mimeType,
        fileName: localMedia.fileName ?? options.fileName,
      };
    }
  } catch (error) {
    if (isMediaIntegrationError(error)) {
      console.warn(
        `[baileys] incoming media upload failed account=${options.channelAccountId} user=${options.channelUserRef}: ${error.message}`
      );
      return undefined;
    }

    console.warn(
      `[baileys] incoming media processing failed account=${options.channelAccountId} user=${options.channelUserRef}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return undefined;
  }
}

async function handleIncomingWhatsAppMessage(
  payload: NormalizedIncomingWhatsAppMessage
): Promise<void> {
  console.log(
    `[baileys] incoming ${payload.messageType} received account=${payload.channelAccountId} user=${payload.channelUserRef}`
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
      media: payload.media,
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

async function resolveBaileysWebVersion(): Promise<WAVersion | undefined> {
  try {
    const result = await fetchLatestWaWebVersion();
    const resolvedVersion = Array.isArray(result.version) ? result.version : undefined;

    if (
      resolvedVersion &&
      resolvedVersion.length === 3 &&
      resolvedVersion.every((part) => typeof part === "number" && Number.isFinite(part))
    ) {
      console.log(
        `[baileys] using fetched WA Web version=${resolvedVersion.join(".")} isLatest=${result.isLatest}`
      );
      return resolvedVersion as WAVersion;
    }

    console.warn(
      "[baileys] WA Web version fetch returned an invalid version shape. Falling back to library defaults."
    );
    return undefined;
  } catch (error) {
    console.warn(
      `[baileys] failed to fetch latest WA Web version; falling back to library defaults: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return undefined;
  }
}

async function clearBaileysAuthState(authFolderPath: string): Promise<void> {
  await rm(authFolderPath, { recursive: true, force: true });
}

function cleanupManagedConnection(channelAccountId: string): void {
  baileysManager.clearQr(channelAccountId);
  baileysManager.remove(channelAccountId);
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

  console.log(`[baileys] initialized channelAccountId=${options.channelAccountId}`);

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
        "Unable to rebuild Baileys connection without a channel account code.",
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

  console.log(
    `[baileys] channelAccountId=${options.channelAccountId} restart required; rebuilding socket from saved auth state.`
  );

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

      if (update.connection === "open") {
        console.log(`[baileys] channelAccountId=${channelAccountId} connection=open`);
        baileysManager.clearQr(channelAccountId);
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
        if (isNonEmptyString(update.qr)) {
          baileysManager.setQr(channelAccountId, update.qr.trim());
        }
        baileysManager.updateState(channelAccountId, (state) => ({
          ...state,
          initialized: true,
          connected: false,
          status: "connecting",
          qrAvailable: isNonEmptyString(update.qr) || state.qrAvailable,
          lastConnectionUpdate: timestamp,
        }));
        return;
      }

      if (update.connection === "close") {
        console.log(
          `[baileys] channelAccountId=${channelAccountId} connection=close statusCode=${disconnectStatusCode ?? "unknown"}`
        );

        if (
          disconnectStatusCode === DisconnectReason.restartRequired ||
          disconnectStatusCode === 515
        ) {
          cleanupManagedConnection(channelAccountId);
          await restartBaileysConnection({
            channelAccountId,
            channelAccountCode,
            authFolderPath,
          });
          return;
        }

        if (
          disconnectStatusCode === DisconnectReason.loggedOut ||
          disconnectStatusCode === 401
        ) {
          console.log(`[baileys] channelAccountId=${channelAccountId} logged out.`);
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
          status: "disconnected",
          qrAvailable: false,
          lastConnectionUpdate: timestamp,
        }));

        void updateChannelAccountConnectionTimestamps({
          channelAccountId,
          disconnectedAt: new Date(),
        });
        return;
      }

      if (isNonEmptyString(update.qr)) {
        baileysManager.setQr(channelAccountId, update.qr.trim());
        baileysManager.updateState(channelAccountId, (state) => ({
          ...state,
          qrAvailable: true,
          lastConnectionUpdate: timestamp,
        }));
      }
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
      void (async () => {
        try {
          if (message.key?.fromMe) {
            console.log(`[baileys] ignoring message from self account=${channelAccountId}`);
            return;
          }

          if (!isNonEmptyString(message.key?.remoteJid)) {
            console.log(`[baileys] ignoring message without remoteJid account=${channelAccountId}`);
            return;
          }

          const channelUserRef = message.key.remoteJid.trim();
          const externalMessageId = isNonEmptyString(message.key.id)
            ? message.key.id.trim()
            : undefined;

          const extractedPayload = extractIncomingMessagePayload(message);
          if (!extractedPayload) {
            console.log(
              `[baileys] unsupported incoming message type ignored account=${channelAccountId} user=${channelUserRef}`
            );
            return;
          }

          const mediaPayload = await resolveIncomingMediaPayload({
            socket,
            channelAccountId,
            channelUserRef,
            message,
            messageType: extractedPayload.messageType,
            externalMessageId,
            mimeType: extractedPayload.mimeType,
            fileName: extractedPayload.fileName,
          });

          if (!mediaPayload && !isNonEmptyString(extractedPayload.text)) {
            console.log(
              `[baileys] incoming message ignored; no usable text or media account=${channelAccountId} user=${channelUserRef}`
            );
            return;
          }

          await handleIncomingWhatsAppMessage({
            channelAccountId,
            channelUserRef,
            messageType: extractedPayload.messageType,
            text: isNonEmptyString(extractedPayload.text)
              ? extractedPayload.text.trim()
              : undefined,
            media: mediaPayload,
            externalMessageId,
          });
        } catch (error) {
          console.warn(
            `[baileys] failed to parse incoming message account=${channelAccountId}: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          );
        }
      })();
    }
  });
}

export async function startBaileys(channelAccountIdValue: unknown): Promise<StartBaileysResult> {
  const channelAccountId = parseChannelAccountId(channelAccountIdValue);
  const existingPendingStart = pendingStartOperations.get(channelAccountId);
  if (existingPendingStart) {
    return existingPendingStart;
  }

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
