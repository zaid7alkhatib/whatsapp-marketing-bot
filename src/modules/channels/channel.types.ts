export const CHANNEL_CODES = ["whatsapp"] as const;
export type ChannelCode = (typeof CHANNEL_CODES)[number];

export const CHANNEL_PROVIDERS = ["baileys"] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CHANNEL_STATUSES = ["active", "inactive"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export interface ChannelCapabilities {
  text: boolean;
  image: boolean;
  document: boolean;
  audio: boolean;
  buttons: boolean;
  lists: boolean;
}

export interface Channel {
  code: ChannelCode;
  name: string;
  provider: ChannelProvider;
  status: ChannelStatus;
  capabilities: ChannelCapabilities;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateChannelBody {
  code?: unknown;
  name?: unknown;
  provider?: unknown;
  status?: unknown;
  capabilities?: {
    text?: unknown;
    image?: unknown;
    document?: unknown;
    audio?: unknown;
    buttons?: unknown;
    lists?: unknown;
  };
}
