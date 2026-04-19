import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import InlineAlert from "../components/InlineAlert";
import JsonBlock from "../components/JsonBlock";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface ChannelAccountRecord {
  _id: string;
  code: string;
  displayName?: string;
}

interface FlowRecord {
  _id: string;
  code: string;
  version: number;
}

interface OrgUnitRecord {
  _id: string;
  code: string;
}

interface BusinessPartnerRecord {
  _id: string;
  names?: {
    fullName?: string;
  };
}

interface RuntimeFormState {
  channelAccountId: string;
  channelUserRef: string;
  flowId: string;
  language: string;
  orgUnitId: string;
  businessPartnerId: string;
  messageType: string;
  text: string;
}

interface RuntimeInboundResult {
  sessionId?: string;
  sessionCreated?: boolean;
  sessionStatus?: string;
  [key: string]: unknown;
}

interface RuntimeHistoryEntry {
  timestamp: string;
  channelUserRef: string;
  text: string;
  sessionId: string;
  sessionCreated: string;
  sessionStatus: string;
}

const INITIAL_FORM: RuntimeFormState = {
  channelAccountId: "",
  channelUserRef: "",
  flowId: "",
  language: "en",
  orgUnitId: "",
  businessPartnerId: "",
  messageType: "text",
  text: "",
};

function formatDateTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }
  return parsedDate.toLocaleString();
}

function RuntimeTestPage() {
  const [form, setForm] = useState<RuntimeFormState>(INITIAL_FORM);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [businessPartners, setBusinessPartners] = useState<BusinessPartnerRecord[]>([]);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<RuntimeInboundResult | null>(null);
  const [history, setHistory] = useState<RuntimeHistoryEntry[]>([]);

  const loadReferences = useCallback(async () => {
    setIsLoadingRefs(true);
    setRefsError(null);

    try {
      const [channelAccountsResponse, flowsResponse, orgUnitsResponse, businessPartnersResponse] =
        await Promise.all([
          api.get<ApiSuccessResponse<ChannelAccountRecord[]>>("/api/v1/channel-accounts"),
          api.get<ApiSuccessResponse<FlowRecord[]>>("/api/v1/flows"),
          api.get<ApiSuccessResponse<OrgUnitRecord[]>>("/api/v1/org-units"),
          api.get<ApiSuccessResponse<BusinessPartnerRecord[]>>("/api/v1/business-partners"),
        ]);

      const nextChannelAccounts = Array.isArray(channelAccountsResponse.data.data)
        ? channelAccountsResponse.data.data
        : [];
      const nextFlows = Array.isArray(flowsResponse.data.data) ? flowsResponse.data.data : [];
      const nextOrgUnits = Array.isArray(orgUnitsResponse.data.data) ? orgUnitsResponse.data.data : [];
      const nextBusinessPartners = Array.isArray(businessPartnersResponse.data.data)
        ? businessPartnersResponse.data.data
        : [];

      setChannelAccounts(nextChannelAccounts);
      setFlows(nextFlows);
      setOrgUnits(nextOrgUnits);
      setBusinessPartners(nextBusinessPartners);

      setForm((previous) => ({
        ...previous,
        channelAccountId: previous.channelAccountId || nextChannelAccounts[0]?._id || "",
        flowId: previous.flowId || nextFlows[0]?._id || "",
        orgUnitId: previous.orgUnitId || nextOrgUnits[0]?._id || "",
        businessPartnerId: previous.businessPartnerId || nextBusinessPartners[0]?._id || "",
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setRefsError(apiMessage ?? error.message ?? "Failed to load reference data.");
      } else {
        setRefsError("Failed to load reference data.");
      }
    } finally {
      setIsLoadingRefs(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!form.channelAccountId) {
      setSubmitError("channelAccountId is required.");
      return;
    }

    if (!form.channelUserRef.trim()) {
      setSubmitError("channelUserRef is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, string> = {
        channelAccountId: form.channelAccountId,
        channelUserRef: form.channelUserRef.trim(),
        messageType: form.messageType || "text",
      };

      if (form.flowId) {
        payload.flowId = form.flowId;
      }
      if (form.language) {
        payload.language = form.language;
      }
      if (form.orgUnitId) {
        payload.orgUnitId = form.orgUnitId;
      }
      if (form.businessPartnerId) {
        payload.businessPartnerId = form.businessPartnerId;
      }
      if (form.text.trim()) {
        payload.text = form.text.trim();
      }

      const response = await api.post<ApiSuccessResponse<RuntimeInboundResult>>(
        "/api/v1/runtime/inbound-message",
        payload
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Runtime request failed.");
      }

      const runtimeResult = response.data.data ?? {};
      setSubmitResult(runtimeResult);

      const historyEntry: RuntimeHistoryEntry = {
        timestamp: new Date().toISOString(),
        channelUserRef: form.channelUserRef.trim(),
        text: form.text.trim() || "-",
        sessionId: typeof runtimeResult.sessionId === "string" ? runtimeResult.sessionId : "-",
        sessionCreated:
          typeof runtimeResult.sessionCreated === "boolean"
            ? runtimeResult.sessionCreated
              ? "yes"
              : "no"
            : "-",
        sessionStatus:
          typeof runtimeResult.sessionStatus === "string" ? runtimeResult.sessionStatus : "-",
      };

      setHistory((previous) => [historyEntry, ...previous]);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Runtime request failed.");
      } else {
        setSubmitError("Runtime request failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageSection
      title="Runtime Test"
      description="Send test requests to runtime inbound-message endpoint."
      onRefresh={() => void loadReferences()}
    >
      {isLoadingRefs ? <LoadingState text="Loading references..." /> : null}

      {!isLoadingRefs && refsError ? <InlineAlert tone="error" message={refsError} /> : null}

      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-grid">
          <label className="form-field">
            <span>Channel Account</span>
            <select
              className="input-control"
              value={form.channelAccountId}
              onChange={(event) => setForm((previous) => ({ ...previous, channelAccountId: event.target.value }))}
              required
            >
              <option value="">Select channel account</option>
              {channelAccounts.map((channelAccount) => (
                <option key={channelAccount._id} value={channelAccount._id}>
                  {channelAccount.code || channelAccount.displayName || channelAccount._id}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Channel User Ref</span>
            <input
              className="input-control"
              type="text"
              value={form.channelUserRef}
              onChange={(event) => setForm((previous) => ({ ...previous, channelUserRef: event.target.value }))}
              placeholder="example-user-001"
              required
            />
          </label>

          <label className="form-field">
            <span>Flow</span>
            <select
              className="input-control"
              value={form.flowId}
              onChange={(event) => setForm((previous) => ({ ...previous, flowId: event.target.value }))}
            >
              <option value="">(optional when session is active)</option>
              {flows.map((flow) => (
                <option key={flow._id} value={flow._id}>
                  {flow.code} v{flow.version}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Language</span>
            <select
              className="input-control"
              value={form.language}
              onChange={(event) => setForm((previous) => ({ ...previous, language: event.target.value }))}
            >
              <option value="">(optional when session is active)</option>
              <option value="en">en</option>
              <option value="ar">ar</option>
              <option value="de">de</option>
            </select>
          </label>

          <label className="form-field">
            <span>Org Unit</span>
            <select
              className="input-control"
              value={form.orgUnitId}
              onChange={(event) => setForm((previous) => ({ ...previous, orgUnitId: event.target.value }))}
            >
              <option value="">(optional)</option>
              {orgUnits.map((orgUnit) => (
                <option key={orgUnit._id} value={orgUnit._id}>
                  {orgUnit.code}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Business Partner</span>
            <select
              className="input-control"
              value={form.businessPartnerId}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, businessPartnerId: event.target.value }))
              }
            >
              <option value="">(optional)</option>
              {businessPartners.map((businessPartner) => (
                <option key={businessPartner._id} value={businessPartner._id}>
                  {businessPartner.names?.fullName || businessPartner._id}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Message Type</span>
            <select
              className="input-control"
              value={form.messageType}
              onChange={(event) => setForm((previous) => ({ ...previous, messageType: event.target.value }))}
            >
              <option value="text">text</option>
              <option value="image">image</option>
              <option value="document">document</option>
              <option value="audio">audio</option>
            </select>
          </label>

          <label className="form-field form-field-full">
            <span>Text</span>
            <input
              className="input-control"
              type="text"
              value={form.text}
              onChange={(event) => setForm((previous) => ({ ...previous, text: event.target.value }))}
              placeholder="Incoming message text"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting || isLoadingRefs}>
            {isSubmitting ? "Sending..." : "Send Runtime Request"}
          </button>
        </div>
      </form>

      {submitError ? <InlineAlert tone="error" message={submitError} /> : null}

      {submitResult ? <JsonBlock title="Latest Success Response" value={submitResult} /> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Channel User Ref</th>
              <th>Text</th>
              <th>Session ID</th>
              <th>Session Created</th>
              <th>Session Status</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6}>No runtime requests yet.</td>
              </tr>
            ) : (
              history.map((entry, index) => (
                <tr key={`${entry.timestamp}-${entry.channelUserRef}-${index}`}>
                  <td>{formatDateTime(entry.timestamp)}</td>
                  <td>{entry.channelUserRef}</td>
                  <td>{entry.text}</td>
                  <td className="cell-mono">{entry.sessionId}</td>
                  <td>{entry.sessionCreated}</td>
                  <td>{entry.sessionStatus === "-" ? "-" : <StatusBadge value={entry.sessionStatus} />}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}

export default RuntimeTestPage;
