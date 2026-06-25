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

interface ChannelAccountRecord {
  _id: string;
  code?: string;
  displayName?: string;
  phoneNumber?: string | null;
}

interface ContactSectionContactRecord {
  _id: string;
  phoneNumber: string;
  displayName?: string | null;
  approved: boolean;
  lastDeliveryStatus: string;
  lastSentAt?: string | null;
  lastAttemptAt?: string | null;
  lastErrorMessage?: string | null;
  sendCount: number;
}

interface ContactSectionRecord {
  _id: string;
  channelAccountId: string;
  name: string;
  description?: string | null;
  contacts: ContactSectionContactRecord[];
  totalContacts: number;
  approvedContacts: number;
  pendingContacts: number;
  sentContacts: number;
  failedContacts: number;
  updatedAt?: string;
}

interface ParsedContact {
  phoneNumber: string;
  displayName?: string;
  approved: boolean;
}

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

function formatDateTime(value?: string | null, language = "en"): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString(language === "ar" ? "ar" : undefined);
}

function normalizePhone(value: string): string | null {
  let digits = value.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
}

function extractContactParts(line: string): { displayName?: string; phoneCandidate: string } {
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

    return { displayName: displayName || undefined, phoneCandidate };
  }

  const phoneMatch = line.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!phoneMatch) {
    return { phoneCandidate: line };
  }

  const displayName = line
    .replace(phoneMatch[1], "")
    .replace(/[,;\t-]+/g, " ")
    .trim();

  return { displayName: displayName || undefined, phoneCandidate: phoneMatch[1] };
}

function parseContacts(input: string): ParsedContact[] {
  const seenPhones = new Set<string>();
  const contacts: ParsedContact[] = [];

  for (const line of input.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const { displayName, phoneCandidate } = extractContactParts(line);
    const phoneNumber = normalizePhone(phoneCandidate);
    if (!phoneNumber || seenPhones.has(phoneNumber)) {
      continue;
    }

    seenPhones.add(phoneNumber);
    contacts.push({ phoneNumber, displayName, approved: true });
  }

  return contacts;
}

function ContactSectionsPage() {
  const { user } = useAuth();
  const { language, t } = useClientLocale();
  const canManageSections =
    user?.role === "super_admin" || user?.role === "admin" || user?.role === "manager";
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [sections, setSections] = useState<ContactSectionRecord[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [channelAccountId, setChannelAccountId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  const selectedSection = useMemo(
    () => sections.find((section) => section._id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  const parsedContacts = useMemo(() => parseContacts(contactInput), [contactInput]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);

    try {
      const [accountsResponse, sectionsResponse] = await Promise.all([
        api.get<ApiSuccessResponse<ChannelAccountRecord[]>>("/api/v1/channel-accounts"),
        api.get<ApiSuccessResponse<ContactSectionRecord[]>>("/api/v1/contact-sections"),
      ]);
      const accounts = Array.isArray(accountsResponse.data.data) ? accountsResponse.data.data : [];
      const records = Array.isArray(sectionsResponse.data.data) ? sectionsResponse.data.data : [];

      setChannelAccounts(accounts);
      setSections(records);
      setChannelAccountId((previous) => {
        if (previous && accounts.some((account) => account._id === previous)) {
          return previous;
        }
        return accounts[0]?._id ?? "";
      });
      setSelectedSectionId((previous) => {
        if (previous && records.some((section) => section._id === previous)) {
          return previous;
        }
        return records[0]?._id ?? "";
      });
    } catch (error) {
      setPageError(getErrorMessage(error, t("contactSections.failedLoad")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setSectionName("");
    setSectionDescription("");
    setContactInput("");
    setSelectedSectionId("");
    setPageSuccess(null);
    setPageError(null);
  };

  const loadSelectedIntoForm = () => {
    if (!selectedSection) {
      return;
    }

    setChannelAccountId(selectedSection.channelAccountId);
    setSectionName(selectedSection.name);
    setSectionDescription(selectedSection.description ?? "");
    setContactInput(
      selectedSection.contacts
        .map((contact) =>
          contact.displayName ? `${contact.displayName}, ${contact.phoneNumber}` : contact.phoneNumber
        )
        .join("\n")
    );
    setPageSuccess(null);
    setPageError(null);
  };

  const submitSection = async (mode: "create" | "update") => {
    if (!canManageSections) {
      setPageError(t("contactSections.cannotSave"));
      return;
    }

    if (!channelAccountId) {
      setPageError(t("contactSections.selectAccountFirst"));
      return;
    }

    if (!sectionName.trim()) {
      setPageError(t("contactSections.nameBeforeSaving"));
      return;
    }

    if (parsedContacts.length === 0) {
      setPageError(t("contactSections.pasteValid"));
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const payload = {
        channelAccountId,
        name: sectionName,
        description: sectionDescription,
        contacts: parsedContacts,
      };
      const response =
        mode === "update" && selectedSectionId
          ? await api.put<ApiSuccessResponse<ContactSectionRecord>>(
              `/api/v1/contact-sections/${selectedSectionId}`,
              payload
            )
          : await api.post<ApiSuccessResponse<ContactSectionRecord>>(
              "/api/v1/contact-sections",
              payload
            );

      const savedSection = response.data.data ?? null;
      setPageSuccess(t("contactSections.saved"));
      await loadData();
      if (savedSection) {
        setSelectedSectionId(savedSection._id);
      }
    } catch (error) {
      setPageError(getErrorMessage(error, t("contactSections.failedSave")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedSectionId || !canManageSections) {
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      await api.delete<ApiSuccessResponse<unknown>>(
        `/api/v1/contact-sections/${selectedSectionId}`
      );
      setPageSuccess(t("contactSections.deleted"));
      resetForm();
      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error, t("contactSections.failedDelete")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageSection
      title={t("contactSections.title")}
      description={t("contactSections.description")}
      onRefresh={() => void loadData()}
    >
      {isLoading ? <LoadingState text={t("contactSections.loading")} /> : null}
      {pageError ? <InlineAlert tone="error" message={pageError} /> : null}
      {pageSuccess ? <InlineAlert tone="success" message={pageSuccess} /> : null}

      <div className="contact-sections-layout">
        <form className="app-form" onSubmit={(event) => event.preventDefault()}>
          <div className="form-header">
            <h3 className="form-title">{t("contactSections.formTitle")}</h3>
            <p className="form-subtitle">
              {t("contactSections.formSubtitle")}
            </p>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span>{t("contactSections.whatsappAccount")}</span>
              <select
                className="input-control"
                value={channelAccountId}
                onChange={(event) => setChannelAccountId(event.target.value)}
                disabled={isSubmitting || channelAccounts.length === 0}
              >
                <option value="">{t("common.selectAccount")}</option>
                {channelAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.displayName || account.code || account._id}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>{t("contactSections.sectionName")}</span>
              <input
                className="input-control"
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                placeholder={t("contactSections.sectionNamePlaceholder")}
                maxLength={120}
                disabled={isSubmitting}
              />
            </label>

            <label className="form-field form-field-full">
              <span>{t("contactSections.descriptionLabel")}</span>
              <input
                className="input-control"
                value={sectionDescription}
                onChange={(event) => setSectionDescription(event.target.value)}
                placeholder={t("contactSections.descriptionPlaceholder")}
                maxLength={500}
                disabled={isSubmitting}
              />
            </label>

            <label className="form-field form-field-full">
              <span>{t("contactSections.contacts")}</span>
              <textarea
                className="input-control text-area-control contact-section-area"
                value={contactInput}
                onChange={(event) => setContactInput(event.target.value)}
                placeholder={"+15551234567\nNour, +963991234567\n+491701234567"}
                disabled={isSubmitting}
              />
              <small className="form-help">
                {t("contactSections.contactHelp", { count: parsedContacts.length })}
              </small>
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void submitSection("create")}
              disabled={isSubmitting || !canManageSections}
            >
              {isSubmitting ? t("common.saving") : t("contactSections.saveNew")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void submitSection("update")}
              disabled={isSubmitting || !selectedSectionId || !canManageSections}
            >
              {t("contactSections.updateSelected")}
            </button>
            <button type="button" className="secondary-button" onClick={resetForm} disabled={isSubmitting}>
              {t("contactSections.newBlank")}
            </button>
          </div>
        </form>

        <aside className="contact-section-panel">
          <div className="outreach-section-heading">
            <div>
              <h3 className="form-title">{t("contactSections.savedSections")}</h3>
              <p className="form-subtitle">{t("contactSections.savedSectionsSubtitle")}</p>
            </div>
          </div>

          {sections.length === 0 ? (
            <InlineAlert tone="empty" message={t("contactSections.none")} />
          ) : (
            <div className="contact-section-list">
              {sections.map((section) => (
                <button
                  type="button"
                  key={section._id}
                  className={
                    selectedSectionId === section._id
                      ? "contact-section-item contact-section-item-active"
                      : "contact-section-item"
                  }
                  onClick={() => setSelectedSectionId(section._id)}
                >
                  <strong>{section.name}</strong>
                  <span>{t("common.contacts", { count: section.totalContacts })}</span>
                  <span>{t("contactSections.pendingCount", { count: section.pendingContacts })}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {selectedSection ? (
        <section className="contact-section-detail">
          <div className="outreach-section-heading">
            <div>
              <h3 className="form-title">{selectedSection.name}</h3>
              <p className="form-subtitle">
                {selectedSection.description || t("contactSections.deliveryMemory")}
              </p>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={loadSelectedIntoForm}>
                {t("contactSections.editInForm")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void deleteSelected()}
                disabled={isSubmitting || !canManageSections}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>

          <div className="lead-summary-grid">
            <div className="lead-summary-card">
              <span>{t("common.total")}</span>
              <strong>{selectedSection.totalContacts}</strong>
            </div>
            <div className="lead-summary-card">
              <span>{t("common.notSentYet")}</span>
              <strong>{selectedSection.pendingContacts}</strong>
            </div>
            <div className="lead-summary-card">
              <span>{t("common.sent")}</span>
              <strong>{selectedSection.sentContacts}</strong>
            </div>
            <div className="lead-summary-card">
              <span>{t("common.failed")}</span>
              <strong>{selectedSection.failedContacts}</strong>
            </div>
          </div>

          <div className="table-wrap contact-section-table-wrap">
            <table className="data-table contact-section-table">
              <thead>
                <tr>
                  <th>{t("contactSections.contacts")}</th>
                  <th>{t("contactSections.delivery")}</th>
                  <th>{t("contactSections.sentCountColumn")}</th>
                  <th>{t("contactSections.lastSent")}</th>
                  <th>{t("contactSections.lastError")}</th>
                </tr>
              </thead>
              <tbody>
                {selectedSection.contacts.map((contact) => (
                  <tr key={contact._id}>
                    <td>
                      <strong>{contact.displayName || contact.phoneNumber}</strong>
                      <p className="cell-mono">{contact.phoneNumber}</p>
                    </td>
                    <td>
                      <StatusBadge value={contact.lastDeliveryStatus} />
                    </td>
                    <td>{contact.sendCount}</td>
                    <td>{formatDateTime(contact.lastSentAt, language)}</td>
                    <td className="cell-wrap">{contact.lastErrorMessage || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PageSection>
  );
}

export default ContactSectionsPage;
