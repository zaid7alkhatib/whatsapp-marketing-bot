import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

type RecipientConsentStatus = "opted_in" | "not_confirmed" | "opted_out";
type RecipientDeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "skipped"
  | "cancelled";

interface MarketingMessageTemplate {
  englishGreeting: string;
  arabicGreeting: string;
  englishResponseInstruction: string;
  arabicResponseInstruction: string;
}

interface ChannelAccountRecord {
  _id: string;
  code?: string;
  displayName?: string;
  phoneNumber?: string | null;
}

interface BaileysStatusRecord {
  connected?: boolean;
  initialized?: boolean;
  status?: string;
  phoneNumber?: string | null;
  lastErrorMessage?: string | null;
}

interface DraftRecipient {
  id: string;
  sourceLine: number;
  phoneNumber: string;
  displayName: string;
  contactSectionId?: string;
  contactId?: string;
  lastDeliveryStatus?: string;
  sendCount?: number;
  consentStatus: RecipientConsentStatus;
  selected: boolean;
  validationError?: string;
}

interface CampaignRecipientRecord {
  _id?: string;
  phoneNumber: string;
  displayName?: string;
  personalizedMessage?: string;
  consentStatus: RecipientConsentStatus;
  status: RecipientDeliveryStatus;
  skippedReason?: string;
  errorMessage?: string;
  sentAt?: string;
}

interface OutreachCampaignRecord {
  _id: string;
  channelAccountId: string;
  title: string;
  message: string;
  messageWithOptOut: string;
  personalizationTemplate?: MarketingMessageTemplate;
  interestTriggers?: string[];
  status: string;
  recipients: CampaignRecipientRecord[];
  totalRecipients: number;
  eligibleRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  errorMessage?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

interface OutreachTemplateRecord {
  _id: string;
  channelAccountId: string;
  name: string;
  personalizationTemplate: MarketingMessageTemplate;
  interestTriggers: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface ContactSectionContactRecord {
  _id: string;
  phoneNumber: string;
  displayName?: string | null;
  approved: boolean;
  lastDeliveryStatus: string;
  sendCount: number;
}

interface ContactSectionRecord {
  _id: string;
  channelAccountId: string;
  name: string;
  contacts: ContactSectionContactRecord[];
  totalContacts: number;
  approvedContacts: number;
  pendingContacts: number;
  sentContacts: number;
  failedContacts: number;
}

const CAMPAIGN_REFRESH_INTERVAL_MS = 3000;
const DEFAULT_MARKETING_MESSAGE_TEMPLATE: MarketingMessageTemplate = {
  englishGreeting: "Hello {name},",
  arabicGreeting: "مرحباً {name}،",
  englishResponseInstruction:
    "To let our team follow up with you, reply with 1 or write Interested.",
  arabicResponseInstruction: "للمتابعة مع فريقنا، أرسل 1 أو اكتب مهتم.",
};
const DEFAULT_INTEREST_TRIGGER_INPUT = ["1", "interested", "مهتم", "مهتمة", "نعم"].join("\n");

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return apiMessage ?? error.message ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatDateTime(value?: string, language = "en"): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString(language === "ar" ? "ar" : undefined);
}

function formatStatus(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatApprovalStatus(
  value: RecipientConsentStatus | string | undefined,
  t: (key: string) => string
): string {
  switch (value) {
    case "opted_in":
      return t("outreach.approved");
    case "not_confirmed":
      return t("outreach.needsReview");
    case "opted_out":
      return t("outreach.doNotSend");
    default:
      return formatStatus(value);
  }
}

function renderTemplateLine(value: string, name: string): string | null {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.replace(/\{name\}/g, name);
}

function getPersonalizedMarketingMessage(
  message: string,
  displayName: string | undefined,
  template: MarketingMessageTemplate
): string {
  const normalizedMessage = message.trim();
  const normalizedName = displayName?.replace(/\s+/g, " ").trim();
  const englishGreetingName = normalizedName || "there";
  const arabicGreetingName = normalizedName || "عميلنا الكريم";

  if (!normalizedMessage) {
    return "";
  }

  const lines: string[] = [];
  const englishGreeting = renderTemplateLine(template.englishGreeting, englishGreetingName);
  const arabicGreeting = renderTemplateLine(template.arabicGreeting, arabicGreetingName);
  const englishInstruction = renderTemplateLine(
    template.englishResponseInstruction,
    englishGreetingName
  );
  const arabicInstruction = renderTemplateLine(
    template.arabicResponseInstruction,
    arabicGreetingName
  );

  if (englishGreeting) {
    lines.push(englishGreeting);
  }
  if (arabicGreeting) {
    lines.push(arabicGreeting);
  }
  if (lines.length > 0) {
    lines.push("");
  }

  lines.push(normalizedMessage);

  const instructionLines = [englishInstruction, arabicInstruction].filter(
    (line): line is string => typeof line === "string"
  );
  if (instructionLines.length > 0) {
    lines.push("", ...instructionLines);
  }

  return lines.join("\n").trim();
}

function getMessagePreview(
  message: string,
  displayName: string | undefined,
  template: MarketingMessageTemplate
): string {
  return getPersonalizedMarketingMessage(message, displayName, template);
}

function parseInterestTriggerInput(value: string): string[] {
  const seenTriggers = new Set<string>();
  const triggers: string[] = [];

  for (const rawTrigger of value.split(/[\n,؛;]+/)) {
    const trigger = rawTrigger.replace(/\s+/g, " ").trim();
    const triggerKey = trigger.toLocaleLowerCase();
    if (!trigger || seenTriggers.has(triggerKey)) {
      continue;
    }

    seenTriggers.add(triggerKey);
    triggers.push(trigger);
  }

  return triggers.slice(0, 30);
}

function normalizePhoneForPreview(value: string): {
  phoneNumber?: string;
  channelUserRef?: string;
  error?: string;
} {
  let digits = value.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    return { error: "Add country code" };
  }

  return {
    phoneNumber: `+${digits}`,
    channelUserRef: `${digits}@s.whatsapp.net`,
  };
}

function extractRecipientParts(line: string): { displayName: string; phoneCandidate: string } {
  const parts = line
    .split(/[,;\t]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const phonePartIndex = parts.findIndex((part) => /\d/.test(part));
    const phoneCandidate = phonePartIndex >= 0 ? parts[phonePartIndex] : parts[0];
    const displayName = parts
      .filter((_part, index) => index !== phonePartIndex)
      .join(" ")
      .trim();

    return { displayName, phoneCandidate };
  }

  const phoneMatch = line.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!phoneMatch) {
    return { displayName: "", phoneCandidate: line };
  }

  return {
    displayName: line
      .replace(phoneMatch[1], "")
      .replace(/[,;\t-]+/g, " ")
      .trim(),
    phoneCandidate: phoneMatch[1],
  };
}

function parseRecipientLines(input: string): DraftRecipient[] {
  const seenRefs = new Set<string>();
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const { displayName, phoneCandidate } = extractRecipientParts(line);
    const normalizedPhone = normalizePhoneForPreview(phoneCandidate);
    const duplicate =
      normalizedPhone.channelUserRef !== undefined && seenRefs.has(normalizedPhone.channelUserRef);

    if (normalizedPhone.channelUserRef && !duplicate) {
      seenRefs.add(normalizedPhone.channelUserRef);
    }

    const validationError = duplicate ? "Duplicate" : normalizedPhone.error;

    return {
      id: `${index}-${line}`,
      sourceLine: index + 1,
      phoneNumber: normalizedPhone.phoneNumber ?? phoneCandidate,
      displayName,
      consentStatus: "not_confirmed",
      selected: !validationError,
      validationError,
    };
  });
}

function campaignIsActive(campaign: OutreachCampaignRecord): boolean {
  return campaign.status === "queued" || campaign.status === "sending";
}

function WhatsAppOutreachPage() {
  const { user } = useAuth();
  const { language, t } = useClientLocale();
  const canSendCampaigns =
    user?.role === "super_admin" || user?.role === "admin" || user?.role === "manager";
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [selectedChannelAccountId, setSelectedChannelAccountId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<BaileysStatusRecord | null>(null);
  const [contactSections, setContactSections] = useState<ContactSectionRecord[]>([]);
  const [selectedContactSectionId, setSelectedContactSectionId] = useState("");
  const [sectionSendMode, setSectionSendMode] = useState<"pending" | "all">("pending");
  const [campaigns, setCampaigns] = useState<OutreachCampaignRecord[]>([]);
  const [outreachTemplates, setOutreachTemplates] = useState<OutreachTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<OutreachCampaignRecord | null>(null);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [message, setMessage] = useState("");
  const [personalizationTemplate, setPersonalizationTemplate] =
    useState<MarketingMessageTemplate>(DEFAULT_MARKETING_MESSAGE_TEMPLATE);
  const [interestTriggerInput, setInterestTriggerInput] = useState(DEFAULT_INTEREST_TRIGGER_INPUT);
  const [recipientInput, setRecipientInput] = useState("");
  const [draftRecipients, setDraftRecipients] = useState<DraftRecipient[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTemplateSubmitting, setIsTemplateSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  const selectedChannelAccount = useMemo(
    () => channelAccounts.find((account) => account._id === selectedChannelAccountId) ?? null,
    [channelAccounts, selectedChannelAccountId]
  );
  const availableContactSections = useMemo(
    () =>
      contactSections.filter((section) => section.channelAccountId === selectedChannelAccountId),
    [contactSections, selectedChannelAccountId]
  );
  const selectedContactSection = useMemo(
    () =>
      availableContactSections.find((section) => section._id === selectedContactSectionId) ??
      null,
    [availableContactSections, selectedContactSectionId]
  );
  const selectedRecipients = useMemo(
    () => draftRecipients.filter((recipient) => recipient.selected),
    [draftRecipients]
  );
  const validSelectedRecipients = useMemo(
    () => selectedRecipients.filter((recipient) => !recipient.validationError),
    [selectedRecipients]
  );
  const approvedSelectedRecipients = useMemo(
    () =>
      validSelectedRecipients.filter((recipient) => recipient.consentStatus === "opted_in"),
    [validSelectedRecipients]
  );
  const invalidRecipients = useMemo(
    () => draftRecipients.filter((recipient) => recipient.validationError),
    [draftRecipients]
  );
  const previewRecipientName = approvedSelectedRecipients[0]?.displayName;
  const messagePreview = useMemo(
    () => getMessagePreview(message, previewRecipientName, personalizationTemplate),
    [message, personalizationTemplate, previewRecipientName]
  );
  const interestTriggers = useMemo(
    () => parseInterestTriggerInput(interestTriggerInput),
    [interestTriggerInput]
  );
  const activeCampaign = campaigns.find(campaignIsActive) ?? null;

  const updateTemplateField = (field: keyof MarketingMessageTemplate, value: string) => {
    setPersonalizationTemplate((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyTemplate = (template: OutreachTemplateRecord) => {
    setSelectedTemplateId(template._id);
    setTemplateName(template.name);
    setPersonalizationTemplate({
      ...DEFAULT_MARKETING_MESSAGE_TEMPLATE,
      ...template.personalizationTemplate,
    });
    setInterestTriggerInput(template.interestTriggers.join("\n"));
    setConsentConfirmed(false);
    setPageSuccess(null);
    setPageError(null);
  };

  const resetTemplateEditor = () => {
    setSelectedTemplateId("");
    setTemplateName("");
    setPersonalizationTemplate(DEFAULT_MARKETING_MESSAGE_TEMPLATE);
    setInterestTriggerInput(DEFAULT_INTEREST_TRIGGER_INPUT);
    setConsentConfirmed(false);
  };

  const loadChannelAccounts = useCallback(async () => {
    setIsLoadingRefs(true);
    setPageError(null);

    try {
      const response = await api.get<ApiSuccessResponse<ChannelAccountRecord[]>>(
        "/api/v1/channel-accounts"
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setChannelAccounts(records);
      setSelectedChannelAccountId((previous) => {
        if (previous && records.some((record) => record._id === previous)) {
          return previous;
        }
        return records[0]?._id ?? "";
      });
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedLoadAccounts")));
      setChannelAccounts([]);
      setSelectedChannelAccountId("");
    } finally {
      setIsLoadingRefs(false);
    }
  }, [t]);

  const loadCampaigns = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoadingCampaigns(true);
    }

    try {
      const response = await api.get<ApiSuccessResponse<OutreachCampaignRecord[]>>(
        "/api/v1/whatsapp-outreach/campaigns"
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setCampaigns(records);
      setSelectedCampaign((current) => {
        if (current) {
          const refreshedCampaign = records.find((record) => record._id === current._id);
          if (refreshedCampaign) {
            return refreshedCampaign;
          }
        }

        return records[0] ?? null;
      });
    } catch (error) {
      if (!silent) {
        setPageError(getErrorMessage(error, t("outreach.failedLoadCampaigns")));
      }
    } finally {
      if (!silent) {
        setIsLoadingCampaigns(false);
      }
    }
  }, [t]);

  const loadContactSections = useCallback(async () => {
    try {
      const response = await api.get<ApiSuccessResponse<ContactSectionRecord[]>>(
        "/api/v1/contact-sections"
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setContactSections(records);
      setSelectedContactSectionId((previous) => {
        if (previous && records.some((record) => record._id === previous)) {
          return previous;
        }
        return "";
      });
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedLoadSections")));
      setContactSections([]);
      setSelectedContactSectionId("");
    }
  }, [t]);

  const loadOutreachTemplates = useCallback(
    async (channelAccountId = selectedChannelAccountId) => {
      if (!channelAccountId) {
        setOutreachTemplates([]);
        setSelectedTemplateId("");
        return;
      }

      try {
        const response = await api.get<ApiSuccessResponse<OutreachTemplateRecord[]>>(
          `/api/v1/whatsapp-outreach/templates?channelAccountId=${encodeURIComponent(channelAccountId)}`
        );
        const records = Array.isArray(response.data.data) ? response.data.data : [];
        setOutreachTemplates(records);
        setSelectedTemplateId((previous) => {
          if (previous && records.some((record) => record._id === previous)) {
            return previous;
          }
          return "";
        });
      } catch (error) {
        setPageError(getErrorMessage(error, t("outreach.failedLoadTemplates")));
        setOutreachTemplates([]);
        setSelectedTemplateId("");
      }
    },
    [selectedChannelAccountId, t]
  );

  const loadConnectionStatus = useCallback(async (channelAccountId: string) => {
    if (!channelAccountId) {
      setConnectionStatus(null);
      return;
    }

    try {
      const response = await api.get<ApiSuccessResponse<BaileysStatusRecord>>(
        `/api/v1/baileys/status/${channelAccountId}`
      );
      setConnectionStatus(response.data.data ?? null);
    } catch {
      setConnectionStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadChannelAccounts();
    void loadCampaigns();
    void loadContactSections();
  }, [loadCampaigns, loadChannelAccounts, loadContactSections]);

  useEffect(() => {
    void loadConnectionStatus(selectedChannelAccountId);
    void loadOutreachTemplates(selectedChannelAccountId);
  }, [loadConnectionStatus, loadOutreachTemplates, selectedChannelAccountId]);

  useEffect(() => {
    if (
      selectedContactSectionId &&
      !availableContactSections.some((section) => section._id === selectedContactSectionId)
    ) {
      setSelectedContactSectionId("");
    }
  }, [availableContactSections, selectedContactSectionId]);

  useEffect(() => {
    const shouldPoll = campaigns.some(campaignIsActive);
    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadCampaigns(true);
    }, CAMPAIGN_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [campaigns, loadCampaigns]);

  const handleImportRecipients = () => {
    const parsedRecipients = parseRecipientLines(recipientInput);
    setDraftRecipients(parsedRecipients);
    setConsentConfirmed(false);
    setPageSuccess(null);

    if (parsedRecipients.length === 0) {
      setPageError(t("outreach.importEmpty"));
      return;
    }

    setPageError(null);
    setPageSuccess(t("outreach.imported", { count: parsedRecipients.length }));
  };

  const handleLoadContactSection = () => {
    if (!selectedContactSection) {
      setPageError(t("outreach.chooseSectionFirst"));
      return;
    }

    const contactsToLoad = selectedContactSection.contacts.filter((contact) => {
      if (!contact.approved) {
        return false;
      }

      if (sectionSendMode === "pending") {
        return contact.lastDeliveryStatus !== "sent";
      }

      return true;
    });

    if (contactsToLoad.length === 0) {
      setPageError(
        sectionSendMode === "pending"
          ? t("outreach.noPendingSectionContacts")
          : t("outreach.noApprovedSectionContacts")
      );
      return;
    }

    const nextRecipients: DraftRecipient[] = contactsToLoad.map((contact, index) => ({
      id: `${selectedContactSection._id}-${contact._id}`,
      sourceLine: index + 1,
      phoneNumber: contact.phoneNumber,
      displayName: contact.displayName ?? "",
      contactSectionId: selectedContactSection._id,
      contactId: contact._id,
      lastDeliveryStatus: contact.lastDeliveryStatus,
      sendCount: contact.sendCount,
      consentStatus: "opted_in",
      selected: true,
    }));

    setDraftRecipients(nextRecipients);
    setRecipientInput("");
    setConsentConfirmed(false);
    setPageError(null);
    setPageSuccess(
      t("outreach.loadedFromSection", {
        count: nextRecipients.length,
        name: selectedContactSection.name,
      })
    );
  };

  const handleRecipientSelectedChange = (id: string, selected: boolean) => {
    setDraftRecipients((previous) =>
      previous.map((recipient) =>
        recipient.id === id ? { ...recipient, selected } : recipient
      )
    );
  };

  const handleRecipientConsentChange = (id: string, consentStatus: RecipientConsentStatus) => {
    setDraftRecipients((previous) =>
      previous.map((recipient) =>
        recipient.id === id ? { ...recipient, consentStatus } : recipient
      )
    );
    setConsentConfirmed(false);
  };

  const handleApproveSelected = () => {
    setDraftRecipients((previous) =>
      previous.map((recipient) =>
        recipient.selected && !recipient.validationError
          ? { ...recipient, consentStatus: "opted_in" }
          : recipient
      )
    );
    setConsentConfirmed(false);
  };

  const handleSelectAllValid = () => {
    setDraftRecipients((previous) =>
      previous.map((recipient) => ({
        ...recipient,
        selected: !recipient.validationError,
      }))
    );
  };

  const handleClearRecipients = () => {
    setDraftRecipients([]);
    setRecipientInput("");
    setConsentConfirmed(false);
    setPageSuccess(null);
    setPageError(null);
  };

  const saveTemplate = async (mode: "create" | "update") => {
    if (!canSendCampaigns) {
      setPageError(t("outreach.noRole"));
      return;
    }

    if (!selectedChannelAccountId) {
      setPageError(t("outreach.selectChannelFirst"));
      return;
    }

    if (!templateName.trim()) {
      setPageError(t("outreach.templateNameRequired"));
      return;
    }

    if (mode === "update" && !selectedTemplateId) {
      setPageError(t("outreach.chooseTemplateFirst"));
      return;
    }

    setIsTemplateSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const payload = {
        channelAccountId: selectedChannelAccountId,
        name: templateName,
        personalizationTemplate,
        interestTriggers,
      };
      const response =
        mode === "update"
          ? await api.put<ApiSuccessResponse<OutreachTemplateRecord>>(
              `/api/v1/whatsapp-outreach/templates/${selectedTemplateId}`,
              payload
            )
          : await api.post<ApiSuccessResponse<OutreachTemplateRecord>>(
              "/api/v1/whatsapp-outreach/templates",
              payload
            );

      const savedTemplate = response.data.data ?? null;
      await loadOutreachTemplates(selectedChannelAccountId);
      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate._id);
        setTemplateName(savedTemplate.name);
      }
      setPageSuccess(t(mode === "update" ? "outreach.templateUpdated" : "outreach.templateSaved"));
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedSaveTemplate")));
    } finally {
      setIsTemplateSubmitting(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplateId) {
      setPageError(t("outreach.chooseTemplateFirst"));
      return;
    }

    setIsTemplateSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      await api.delete<ApiSuccessResponse<unknown>>(
        `/api/v1/whatsapp-outreach/templates/${selectedTemplateId}`
      );
      resetTemplateEditor();
      await loadOutreachTemplates(selectedChannelAccountId);
      setPageSuccess(t("outreach.templateDeleted"));
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedDeleteTemplate")));
    } finally {
      setIsTemplateSubmitting(false);
    }
  };

  const handleSubmitCampaign = async () => {
    if (!canSendCampaigns) {
      setPageError(t("outreach.noRole"));
      return;
    }

    if (!selectedChannelAccountId) {
      setPageError(t("outreach.selectChannelFirst"));
      return;
    }

    if (!connectionStatus?.connected) {
      setPageError(t("outreach.connectBeforeSend"));
      return;
    }

    if (!message.trim()) {
      setPageError(t("outreach.writeMessage"));
      return;
    }

    if (approvedSelectedRecipients.length === 0) {
      setPageError(t("outreach.approveOne"));
      return;
    }

    if (!consentConfirmed) {
      setPageError(t("outreach.confirmBeforeSend"));
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const response = await api.post<ApiSuccessResponse<OutreachCampaignRecord>>(
        "/api/v1/whatsapp-outreach/campaigns",
        {
          channelAccountId: selectedChannelAccountId,
          title: campaignTitle,
          message,
          personalizationTemplate,
          interestTriggers,
          consentConfirmed,
          recipients: validSelectedRecipients.map((recipient) => ({
            phoneNumber: recipient.phoneNumber,
            displayName: recipient.displayName,
            contactSectionId: recipient.contactSectionId,
            contactId: recipient.contactId,
            consentStatus: recipient.consentStatus,
            selected: true,
          })),
        }
      );

      const createdCampaign = response.data.data ?? null;
      setPageSuccess(t("outreach.queued"));
      setSelectedCampaign(createdCampaign);
      setConsentConfirmed(false);
      await loadCampaigns(true);
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedQueue")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    setIsCancelling(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const response = await api.post<ApiSuccessResponse<OutreachCampaignRecord>>(
        `/api/v1/whatsapp-outreach/campaigns/${campaignId}/cancel`
      );
      setSelectedCampaign(response.data.data ?? selectedCampaign);
      setPageSuccess(t("outreach.cancelled"));
      await loadCampaigns(true);
    } catch (error) {
      setPageError(getErrorMessage(error, t("outreach.failedCancel")));
    } finally {
      setIsCancelling(false);
    }
  };

  const isBusy = isLoadingRefs || isSubmitting || isTemplateSubmitting || isCancelling;
  const sendDisabled =
    isBusy ||
    !canSendCampaigns ||
    !selectedChannelAccountId ||
    !connectionStatus?.connected ||
    !message.trim() ||
    approvedSelectedRecipients.length === 0 ||
    !consentConfirmed ||
    Boolean(activeCampaign);

  return (
    <PageSection
      title={t("outreach.title")}
      description={t("outreach.description")}
      onRefresh={() => {
        void loadChannelAccounts();
        void loadCampaigns();
        void loadContactSections();
        void loadConnectionStatus(selectedChannelAccountId);
      }}
    >
      {isLoadingRefs ? <LoadingState text={t("baileys.loadingAccounts")} /> : null}
      {pageError ? <InlineAlert tone="error" message={pageError} /> : null}
      {pageSuccess ? <InlineAlert tone="success" message={pageSuccess} /> : null}

      <div className="outreach-layout">
        <form className="app-form outreach-composer" onSubmit={(event) => event.preventDefault()}>
          <div className="form-header">
            <h3 className="form-title">{t("outreach.campaignTitle")}</h3>
            <p className="form-subtitle">
              {t("outreach.campaignSubtitle")}
            </p>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span>{t("outreach.whatsappAccount")}</span>
              <select
                className="input-control"
                value={selectedChannelAccountId}
                onChange={(event) => {
                  setSelectedChannelAccountId(event.target.value);
                  setPageError(null);
                  setPageSuccess(null);
                }}
                disabled={isLoadingRefs || channelAccounts.length === 0}
              >
                <option value="">{t("common.selectAccount")}</option>
                {channelAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.displayName || account.code || account._id}
                  </option>
                ))}
              </select>
              <small className="form-help">
                {selectedChannelAccount
                  ? selectedChannelAccount.phoneNumber || selectedChannelAccount.code || selectedChannelAccount._id
                  : t("common.noAccountSelected")}
              </small>
            </label>

            <label className="form-field">
              <span>{t("outreach.campaignName")}</span>
              <input
                className="input-control"
                type="text"
                value={campaignTitle}
                onChange={(event) => setCampaignTitle(event.target.value)}
                placeholder={t("outreach.campaignNamePlaceholder")}
                maxLength={160}
              />
              <small className="form-help">{t("outreach.campaignNameHelp")}</small>
            </label>

            <label className="form-field">
              <span>{t("outreach.contactSection")}</span>
              <select
                className="input-control"
                value={selectedContactSectionId}
                onChange={(event) => setSelectedContactSectionId(event.target.value)}
                disabled={isBusy || availableContactSections.length === 0}
              >
                <option value="">{t("outreach.chooseSavedSection")}</option>
                {availableContactSections.map((section) => (
                  <option key={section._id} value={section._id}>
                    {t("outreach.sectionOption", {
                      name: section.name,
                      pending: section.pendingContacts,
                    })}
                  </option>
                ))}
              </select>
              <small className="form-help">
                {selectedContactSection
                  ? t("outreach.sectionStats", {
                      total: selectedContactSection.totalContacts,
                      sent: selectedContactSection.sentContacts,
                    })
                  : t("outreach.sectionHelp")}
              </small>
            </label>

            <label className="form-field">
              <span>{t("outreach.sectionSendMode")}</span>
              <select
                className="input-control"
                value={sectionSendMode}
                onChange={(event) => setSectionSendMode(event.target.value as "pending" | "all")}
                disabled={isBusy}
              >
                <option value="pending">{t("outreach.onlyPending")}</option>
                <option value="all">{t("outreach.allApproved")}</option>
              </select>
              <small className="form-help">
                {t("outreach.pendingModeHelp")}
              </small>
            </label>

            <label className="form-field form-field-full">
              <span>{t("outreach.message")}</span>
              <textarea
                className="input-control text-area-control outreach-message-area"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("outreach.messagePlaceholder")}
                maxLength={4000}
              />
              <small className="form-help">
                {t("outreach.messageHelp", { count: message.length })}
              </small>
            </label>

            <div className="form-field form-field-full outreach-template-fields">
              <div className="outreach-template-heading">
                <span>{t("outreach.previewTemplate")}</span>
              </div>
              <small className="form-help">{t("outreach.previewTemplateHelp")}</small>
              <div className="outreach-template-manager">
                <label className="form-field">
                  <span>{t("outreach.savedTemplate")}</span>
                  <select
                    className="input-control"
                    value={selectedTemplateId}
                    onChange={(event) => {
                      const template = outreachTemplates.find(
                        (record) => record._id === event.target.value
                      );
                      if (template) {
                        applyTemplate(template);
                      } else {
                        setSelectedTemplateId("");
                      }
                    }}
                    disabled={isBusy || outreachTemplates.length === 0}
                  >
                    <option value="">{t("outreach.chooseTemplate")}</option>
                    {outreachTemplates.map((template) => (
                      <option key={template._id} value={template._id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>{t("outreach.templateName")}</span>
                  <input
                    className="input-control"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t("outreach.templateNamePlaceholder")}
                    maxLength={120}
                    disabled={isBusy}
                  />
                </label>
              </div>
              <div className="form-actions outreach-template-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void saveTemplate("create")}
                  disabled={isBusy || !selectedChannelAccountId}
                >
                  {isTemplateSubmitting ? t("common.saving") : t("outreach.saveTemplate")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void saveTemplate("update")}
                  disabled={isBusy || !selectedTemplateId}
                >
                  {t("outreach.updateTemplate")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void deleteTemplate()}
                  disabled={isBusy || !selectedTemplateId}
                >
                  {t("outreach.deleteTemplate")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetTemplateEditor}
                  disabled={isBusy}
                >
                  {t("outreach.resetTemplate")}
                </button>
              </div>
              <div className="outreach-template-grid">
                <label className="form-field">
                  <span>{t("outreach.englishGreeting")}</span>
                  <input
                    className="input-control"
                    value={personalizationTemplate.englishGreeting}
                    onChange={(event) =>
                      updateTemplateField("englishGreeting", event.target.value)
                    }
                    maxLength={300}
                    disabled={isBusy}
                  />
                </label>
                <label className="form-field">
                  <span>{t("outreach.arabicGreeting")}</span>
                  <input
                    className="input-control"
                    value={personalizationTemplate.arabicGreeting}
                    onChange={(event) =>
                      updateTemplateField("arabicGreeting", event.target.value)
                    }
                    maxLength={300}
                    dir="rtl"
                    disabled={isBusy}
                  />
                </label>
                <label className="form-field">
                  <span>{t("outreach.englishResponse")}</span>
                  <input
                    className="input-control"
                    value={personalizationTemplate.englishResponseInstruction}
                    onChange={(event) =>
                      updateTemplateField("englishResponseInstruction", event.target.value)
                    }
                    maxLength={500}
                    disabled={isBusy}
                  />
                </label>
                <label className="form-field">
                  <span>{t("outreach.arabicResponse")}</span>
                  <input
                    className="input-control"
                    value={personalizationTemplate.arabicResponseInstruction}
                    onChange={(event) =>
                      updateTemplateField("arabicResponseInstruction", event.target.value)
                    }
                    maxLength={500}
                    dir="rtl"
                    disabled={isBusy}
                  />
                </label>
                <label className="form-field form-field-full">
                  <span>{t("outreach.interestTriggers")}</span>
                  <textarea
                    className="input-control text-area-control outreach-trigger-area"
                    value={interestTriggerInput}
                    onChange={(event) => setInterestTriggerInput(event.target.value)}
                    maxLength={1000}
                    disabled={isBusy}
                  />
                  <small className="form-help">
                    {t("outreach.interestTriggersHelp", { count: interestTriggers.length })}
                  </small>
                </label>
              </div>
            </div>

            <label className="form-field form-field-full">
              <span>{t("outreach.numbers")}</span>
              <textarea
                className="input-control text-area-control outreach-recipient-area"
                value={recipientInput}
                onChange={(event) => setRecipientInput(event.target.value)}
                placeholder={"+15551234567\nNour, +963991234567\n+491701234567"}
              />
              <small className="form-help">
                {t("outreach.numbersHelp")}
              </small>
            </label>
          </div>

          <div className="form-actions outreach-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleLoadContactSection}
              disabled={isBusy || !selectedContactSectionId}
            >
              {t("outreach.loadSection")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleImportRecipients}
              disabled={isBusy}
            >
              {t("outreach.importNumbers")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleApproveSelected}
              disabled={draftRecipients.length === 0 || isBusy}
            >
              {t("outreach.approveSelected")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleSelectAllValid}
              disabled={draftRecipients.length === 0 || isBusy}
            >
              {t("outreach.selectValid")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleClearRecipients}
              disabled={draftRecipients.length === 0 || isBusy}
            >
              {t("outreach.clear")}
            </button>
          </div>

          <label className="outreach-consent-check">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) => setConsentConfirmed(event.target.checked)}
              disabled={approvedSelectedRecipients.length === 0 || isBusy}
            />
            <span>
              {t("outreach.confirm")}
            </span>
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="primary-button outreach-send-button"
              onClick={() => void handleSubmitCampaign()}
              disabled={sendDisabled}
            >
              {isSubmitting ? t("common.queueing") : t("outreach.send")}
            </button>
            {activeCampaign ? (
              <span className="muted-text">
                {t("outreach.activeCampaignWarning")}
              </span>
            ) : null}
          </div>
        </form>

        <aside className="outreach-side">
          <div className="outreach-status-strip">
            <span className="outreach-status-label">{t("outreach.connection")}</span>
            <StatusBadge
              value={connectionStatus?.connected ? "connected" : connectionStatus?.status ?? "disconnected"}
            />
            <p className="muted-text">
              {connectionStatus?.lastErrorMessage
                ? connectionStatus.lastErrorMessage
                : connectionStatus?.phoneNumber
                ? t("outreach.linkedPhone", { phone: connectionStatus.phoneNumber })
                : t("outreach.pairBeforeSend")}
            </p>
          </div>

          <div className="outreach-metric-grid">
            <div className="outreach-metric">
              <span>{t("outreach.recipients")}</span>
              <strong>{draftRecipients.length}</strong>
            </div>
            <div className="outreach-metric">
              <span>{t("common.selected")}</span>
              <strong>{selectedRecipients.length}</strong>
            </div>
            <div className="outreach-metric">
              <span>{t("outreach.approved")}</span>
              <strong>{approvedSelectedRecipients.length}</strong>
            </div>
            <div className="outreach-metric">
              <span>{t("outreach.needsReview")}</span>
              <strong>{invalidRecipients.length}</strong>
            </div>
          </div>

          <div className="outreach-preview">
            <div className="outreach-preview-header">
              <h3 className="form-title">{t("outreach.preview")}</h3>
              <span className="muted-text">{t("common.chars", { count: messagePreview.length })}</span>
            </div>
            <pre>{messagePreview}</pre>
          </div>
        </aside>
      </div>

      {draftRecipients.length > 0 ? (
        <div className="outreach-recipient-review">
          <div className="outreach-section-heading">
            <div>
              <h3 className="form-title">{t("outreach.recipientReview")}</h3>
              <p className="form-subtitle">
                {t("outreach.recipientReviewSubtitle")}
              </p>
            </div>
            <span className="outreach-count-pill">
              {t("outreach.ready", { count: approvedSelectedRecipients.length })}
            </span>
          </div>

          <div className="table-wrap outreach-table-wrap">
            <table className="data-table outreach-recipient-table">
              <thead>
                <tr>
                  <th>{t("outreach.select")}</th>
                  <th>{t("outreach.line")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("outreach.lastDelivery")}</th>
                  <th>{t("outreach.approval")}</th>
                  <th>{t("outreach.review")}</th>
                </tr>
              </thead>
              <tbody>
                {draftRecipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={recipient.selected}
                        onChange={(event) =>
                          handleRecipientSelectedChange(recipient.id, event.target.checked)
                        }
                        disabled={Boolean(recipient.validationError)}
                      />
                    </td>
                    <td className="cell-mono">{recipient.sourceLine}</td>
                    <td>{recipient.displayName || "-"}</td>
                    <td className="cell-mono">{recipient.phoneNumber}</td>
                    <td>
                      {recipient.lastDeliveryStatus ? (
                        <StatusBadge value={recipient.lastDeliveryStatus} />
                      ) : (
                        <span className="muted-text">{t("common.manual")}</span>
                      )}
                      {recipient.sendCount ? (
                        <p className="muted-text">{t("common.sentCount", { count: recipient.sendCount })}</p>
                      ) : null}
                    </td>
                    <td>
                      <select
                        className="input-control outreach-consent-select"
                        value={recipient.consentStatus}
                        onChange={(event) =>
                          handleRecipientConsentChange(
                            recipient.id,
                            event.target.value as RecipientConsentStatus
                          )
                        }
                        disabled={Boolean(recipient.validationError) || !recipient.selected}
                      >
                        <option value="not_confirmed">{t("outreach.needsReview")}</option>
                        <option value="opted_in">{t("outreach.approved")}</option>
                        <option value="opted_out">{t("outreach.doNotSend")}</option>
                      </select>
                    </td>
                    <td>
                      {recipient.validationError ? (
                        <StatusBadge value={recipient.validationError} />
                      ) : recipient.consentStatus === "opted_in" && recipient.selected ? (
                        <StatusBadge value="queued" />
                      ) : (
                        <span className="muted-text">{t("outreach.needsApproval")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="outreach-history-grid">
        <section className="outreach-history-list">
          <div className="outreach-section-heading">
            <div>
              <h3 className="form-title">{t("outreach.campaignHistory")}</h3>
              <p className="form-subtitle">{t("outreach.latestCampaigns")}</p>
            </div>
            {isLoadingCampaigns ? <span className="muted-text">{t("common.loading")}</span> : null}
          </div>

          {isLoadingCampaigns ? <LoadingState text={t("outreach.loadingCampaigns")} /> : null}

          {!isLoadingCampaigns && campaigns.length === 0 ? (
            <InlineAlert tone="empty" message={t("outreach.noCampaigns")} />
          ) : null}

          {!isLoadingCampaigns && campaigns.length > 0 ? (
            <div className="outreach-campaign-list">
              {campaigns.map((campaign) => (
                <button
                  key={campaign._id}
                  type="button"
                  className={
                    selectedCampaign?._id === campaign._id
                      ? "outreach-campaign-item outreach-campaign-item-active"
                      : "outreach-campaign-item"
                  }
                  onClick={() => setSelectedCampaign(campaign)}
                >
                  <span className="outreach-campaign-item-main">
                    <span>
                      <strong>{campaign.title}</strong>
                      <span className="outreach-campaign-date">
                        {formatDateTime(campaign.createdAt, language)}
                      </span>
                    </span>
                    <StatusBadge value={formatStatus(campaign.status)} />
                  </span>
                  <span className="outreach-campaign-item-meta">
                    <span className="cell-mono">
                      {campaign.sentCount}/{campaign.eligibleRecipients} {t("common.sent")}
                    </span>
                    {campaign.failedCount > 0 ? (
                      <span className="outreach-failure-text">{t("common.failedCount", { count: campaign.failedCount })}</span>
                    ) : null}
                    {campaign.skippedCount > 0 ? (
                      <span className="muted-text">{t("common.skippedCount", { count: campaign.skippedCount })}</span>
                    ) : null}
                  </span>
                  <span className="outreach-campaign-message">{campaign.message}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="outreach-campaign-detail">
          <div className="outreach-section-heading">
            <div>
              <h3 className="form-title">{t("outreach.campaignDetail")}</h3>
              <p className="form-subtitle">
                {selectedCampaign ? selectedCampaign.title : t("outreach.selectCampaign")}
              </p>
            </div>
            {selectedCampaign && campaignIsActive(selectedCampaign) && canSendCampaigns ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleCancelCampaign(selectedCampaign._id)}
                disabled={isCancelling}
              >
                {isCancelling ? t("common.cancelling") : t("common.cancel")}
              </button>
            ) : null}
          </div>

          {selectedCampaign ? (
            <>
              <div className="detail-wrap outreach-detail-wrap">
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">{t("common.status")}</span>
                    <span className="detail-value">
                      <StatusBadge value={formatStatus(selectedCampaign.status)} />
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t("outreach.approved")}</span>
                    <span className="detail-value">{selectedCampaign.eligibleRecipients}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t("common.sent")}</span>
                    <span className="detail-value">{selectedCampaign.sentCount}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t("common.failed")}</span>
                    <span className="detail-value">{selectedCampaign.failedCount}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t("common.skipped")}</span>
                    <span className="detail-value">{selectedCampaign.skippedCount}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t("common.completed")}</span>
                    <span className="detail-value">{formatDateTime(selectedCampaign.completedAt, language)}</span>
                  </div>
                </div>
              </div>

              {selectedCampaign.errorMessage ? (
                <InlineAlert tone="error" message={selectedCampaign.errorMessage} />
              ) : null}

              <div className="outreach-recipient-results">
                {selectedCampaign.recipients.map((recipient) => (
                  <article className="outreach-recipient-result" key={recipient._id ?? recipient.phoneNumber}>
                    <div>
                      <span className="detail-label">{t("outreach.recipient")}</span>
                      <strong>{recipient.displayName || "-"}</strong>
                      <p className="cell-mono">{recipient.phoneNumber}</p>
                    </div>
                    <div>
                      <span className="detail-label">{t("outreach.approval")}</span>
                      <p>{formatApprovalStatus(recipient.consentStatus, t)}</p>
                    </div>
                    <div>
                      <span className="detail-label">{t("common.status")}</span>
                      <p>
                        <StatusBadge value={formatStatus(recipient.status)} />
                      </p>
                    </div>
                    <p className="outreach-result-message">
                      {recipient.errorMessage ||
                        recipient.skippedReason ||
                        formatDateTime(recipient.sentAt, language)}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <InlineAlert tone="empty" message={t("outreach.selectCampaignResults")} />
          )}
        </section>
      </div>
    </PageSection>
  );
}

export default WhatsAppOutreachPage;
