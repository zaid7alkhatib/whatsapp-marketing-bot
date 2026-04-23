import type { WASocket } from "@whiskeysockets/baileys";

export type BaileysRuntimeStatus =
  | "not_initialized"
  | "connecting"
  | "connected"
  | "disconnected";

export interface BaileysConnectionState {
  channelAccountId: string;
  initialized: boolean;
  connected: boolean;
  status: BaileysRuntimeStatus;
  lastConnectionUpdate: string | null;
  qrAvailable: boolean;
  phoneNumber: string | null;
}

export interface ManagedBaileysConnection {
  channelAccountId: string;
  channelAccountCode: string;
  authFolderPath: string;
  socket: WASocket;
  state: BaileysConnectionState;
}

export interface StartBaileysResult extends BaileysConnectionState {}

export interface LogoutBaileysResult extends BaileysConnectionState {}

export interface BaileysQrResult {
  channelAccountId: string;
  qr: string | null;
}

export type IncomingWhatsAppMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document";

export interface NormalizedIncomingWhatsAppMedia {
  provider: "cloudflare" | "local";
  assetId: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export interface NormalizedIncomingWhatsAppMessage {
  channelAccountId: string;
  channelUserRef: string;
  messageType: IncomingWhatsAppMessageType;
  text?: string;
  media?: NormalizedIncomingWhatsAppMedia;
  externalMessageId?: string;
}
