import { Types } from "mongoose";

export interface StartSessionBody {
  channelAccountId?: unknown;
  channelUserRef?: unknown;
  flowId?: unknown;
  language?: unknown;
  orgUnitId?: unknown;
  businessPartnerId?: unknown;
}

export interface ProcessMessageBody {
  sessionId?: unknown;
  messageType?: unknown;
  text?: unknown;
  media?: unknown;
  externalMessageId?: unknown;
}

export interface StartSessionResult {
  session: unknown;
  currentStep: unknown;
  currentContent: string;
  createdOutboundMessageId: string | null;
}

export interface CreatedOutboundMessage {
  stepCode: string;
  messageId: string;
  text: string;
}

export interface ProcessMessageResult {
  sessionId: string;
  previousStepCode: string;
  nextStepCode: string;
  sessionStatus: string;
  nextStep: unknown | null;
  nextContent: string;
  createdInboundMessageId: string;
  createdStepResponseId: string;
  createdOutboundMessages: CreatedOutboundMessage[];
  createdServiceRequestId?: string;
}

export interface ChoiceTransitionCondition {
  operator?: string;
  value?: string;
}

export interface ChoiceTransitionRule {
  when?: ChoiceTransitionCondition | string;
  nextStepCode?: string;
  toStepCode?: string;
}

export interface MessageTransitionRule {
  when?: string;
  toStepCode?: string;
  nextStepCode?: string;
}

export interface FlowStepLike {
  _id: Types.ObjectId;
  code: string;
  type: string;
  sequence?: number;
  status?: string;
  contentKey?: string;
  stepConfig?: {
    dataKey?: unknown;
    choiceMap?: unknown;
    orgUnitMap?: unknown;
    dynamicChoiceSource?: unknown;
    [key: string]: unknown;
  };
  transitionConfig?: unknown[];
}
