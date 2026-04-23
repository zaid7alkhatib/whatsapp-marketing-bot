import { ProcessMessageResult, StartSessionResult } from "../bot-engine/bot-engine.types";

export interface RuntimeInboundMediaPayload {
  provider?: unknown;
  assetId?: unknown;
  url?: unknown;
  thumbnailUrl?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
}

export interface RuntimeInboundMessageBody {
  channelAccountId?: unknown;
  channelUserRef?: unknown;
  messageType?: unknown;
  text?: unknown;
  media?: unknown;
  externalMessageId?: unknown;
  flowId?: unknown;
  language?: unknown;
  orgUnitId?: unknown;
  businessPartnerId?: unknown;
}

export interface RuntimeInboundMessageResult {
  sessionId: string;
  sessionCreated: boolean;
  sessionStatus: string;
  startSession: StartSessionResult | null;
  processResult: ProcessMessageResult | null;
}
