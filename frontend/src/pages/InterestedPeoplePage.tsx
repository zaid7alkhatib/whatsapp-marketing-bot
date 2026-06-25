import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import type { DashboardRole } from "../auth/auth.types";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface InterestedLeadRecord {
  _id: string;
  channelAccountId: string;
  channelAccountName: string;
  channelAccountPhoneNumber?: string | null;
  channelUserRef: string;
  phoneNumber: string;
  displayName?: string | null;
  lastMessage: string;
  trigger: string;
  status: string;
  acknowledgementMessage: string;
  acknowledgementSentAt?: string;
  acknowledgementError?: string | null;
  firstInterestedAt: string;
  lastInterestedAt: string;
  messageCount: number;
}

type LeadFilter = "all" | "needs_follow_up" | "acknowledged";

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return apiMessage ?? error.message ?? fallback;
  }

  return error instanceof Error && error.message ? error.message : fallback;
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

function getRoleLabel(role?: DashboardRole): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "viewer":
      return "Follow-up Agent";
    default:
      return "Team";
  }
}

function getLeadPhoneDigits(lead: InterestedLeadRecord): string | null {
  const phoneDigits = lead.phoneNumber.replace(/\D/g, "");
  const phoneLooksHidden =
    lead.phoneNumber.toLowerCase().includes("hidden") ||
    lead.phoneNumber.includes("مخفي");

  if (!phoneLooksHidden && phoneDigits.length >= 8) {
    return phoneDigits;
  }

  if (lead.channelUserRef.toLowerCase().endsWith("@lid")) {
    return null;
  }

  const jidDigits = lead.channelUserRef.endsWith("@s.whatsapp.net")
    ? lead.channelUserRef.split("@")[0]?.replace(/\D/g, "")
    : "";

  return jidDigits.length >= 8 ? jidDigits : null;
}

function buildWhatsAppUrl(lead: InterestedLeadRecord, roleLabel: string, agentName: string): string | null {
  const digits = getLeadPhoneDigits(lead);
  if (!digits) {
    return null;
  }

  const message = `Hi, I am here to continue with you.\n\n${roleLabel} | ${agentName}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function InterestedPeoplePage() {
  const { user } = useAuth();
  const { language, t } = useClientLocale();
  const [leads, setLeads] = useState<InterestedLeadRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<LeadFilter>("all");

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<InterestedLeadRecord[]>>(
        "/api/v1/interested-leads"
      );
      setLeads(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t("interested.failedLoad")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const acknowledgedCount = useMemo(
    () => leads.filter((lead) => lead.status === "acknowledged").length,
    [leads]
  );
  const pendingCount = useMemo(
    () => leads.filter((lead) => lead.status === "new" || lead.status === "ack_failed").length,
    [leads]
  );

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "acknowledged" && lead.status === "acknowledged") ||
        (filter === "needs_follow_up" &&
          (lead.status === "new" || lead.status === "ack_failed"));

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        lead.displayName,
        lead.phoneNumber,
        lead.channelAccountName,
        lead.lastMessage,
        lead.trigger,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [filter, leads, searchTerm]);

  const roleLabel = getRoleLabel(user?.role);
  const agentName = user?.displayName || user?.username || "Team";
  const followUpSignature = `${roleLabel} | ${agentName}`;

  return (
    <PageSection
      title={t("interested.title")}
      description={t("interested.description")}
      onRefresh={() => void loadLeads()}
    >
      {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      <div className="lead-summary-grid">
        <div className="lead-summary-card">
          <span>{t("interested.total")}</span>
          <strong>{leads.length}</strong>
        </div>
        <div className="lead-summary-card">
          <span>{t("interested.acknowledged")}</span>
          <strong>{acknowledgedCount}</strong>
        </div>
        <div className="lead-summary-card">
          <span>{t("interested.needsFollowUp")}</span>
          <strong>{pendingCount}</strong>
        </div>
      </div>

      <div className="lead-controls">
        <label className="form-field lead-search">
          <span>Search</span>
          <input
            className="input-control"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, phone, reply, or trigger..."
          />
        </label>
        <div className="segmented-control" aria-label="Lead filters">
          <button
            type="button"
            className={filter === "all" ? "segment-active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={filter === "needs_follow_up" ? "segment-active" : ""}
            onClick={() => setFilter("needs_follow_up")}
          >
            Needs follow-up
          </button>
          <button
            type="button"
            className={filter === "acknowledged" ? "segment-active" : ""}
            onClick={() => setFilter("acknowledged")}
          >
            Acknowledged
          </button>
        </div>
      </div>

      {isLoading ? <LoadingState text={t("interested.loading")} /> : null}

      {!isLoading && leads.length === 0 ? <InlineAlert tone="empty" message={t("interested.none")} /> : null}
      {!isLoading && leads.length > 0 && filteredLeads.length === 0 ? (
        <InlineAlert tone="empty" message="No interested people match this search." />
      ) : null}

      {!isLoading && filteredLeads.length > 0 ? (
        <div className="lead-card-list">
          {filteredLeads.map((lead) => {
            const followUpUrl = buildWhatsAppUrl(lead, roleLabel, agentName);
            const replyCountKey =
              lead.messageCount === 1 ? "interested.replyCount" : "interested.replyCountPlural";

            return (
              <article className="lead-card" key={lead._id}>
                <div className="lead-card-header">
                  <button
                    type="button"
                    className="lead-person-button"
                    disabled={!followUpUrl}
                    onClick={() => {
                      if (followUpUrl) {
                        window.open(followUpUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <strong>{lead.displayName || lead.phoneNumber}</strong>
                    <span>{lead.phoneNumber}</span>
                  </button>

                  <div className="lead-card-status">
                    <StatusBadge value={lead.status} />
                    <span>
                      {t(replyCountKey, {
                        count: lead.messageCount,
                      })}
                    </span>
                  </div>
                </div>

                <div className="lead-card-grid">
                  <div>
                    <span>{t("interested.lastReply")}</span>
                    <p>{lead.lastMessage}</p>
                  </div>
                  <div>
                    <span>{t("interested.trigger")}</span>
                    <p className="cell-mono">{lead.trigger}</p>
                  </div>
                  <div>
                    <span>{t("interested.lastInterested")}</span>
                    <p>{formatDateTime(lead.lastInterestedAt, language)}</p>
                  </div>
                  <div>
                    <span>Account</span>
                    <p>{lead.channelAccountName}</p>
                  </div>
                </div>

                <div className="lead-acknowledgement">
                  <span>{t("interested.acknowledgement")}</span>
                  <p>{lead.acknowledgementMessage}</p>
                  <small>
                    {lead.acknowledgementSentAt
                      ? t("interested.sentAt", {
                          date: formatDateTime(lead.acknowledgementSentAt, language),
                        })
                      : lead.acknowledgementError || t("interested.notSentYet")}
                  </small>
                </div>

                <div className="lead-card-actions">
                  {followUpUrl ? (
                    <a
                      className="primary-button lead-whatsapp-button"
                      href={followUpUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open WhatsApp
                    </a>
                  ) : (
                    <button type="button" className="secondary-button lead-whatsapp-button" disabled>
                      Phone hidden
                    </button>
                  )}
                  <span className="form-help">
                    Message starts with: Hi, I am here to continue with you. {followUpSignature}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </PageSection>
  );
}

export default InterestedPeoplePage;
