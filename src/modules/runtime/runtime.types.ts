import { ProcessMessageResult, StartSessionResult } from "../bot-engine/bot-engine.types";

export interface RuntimeInboundMessageBody {
  channelAccountId?: unknown;
  channelUserRef?: unknown;
  messageType?: unknown;
  text?: unknown;
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
