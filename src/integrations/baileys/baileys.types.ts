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
  lastErrorMessage: string | null;
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
