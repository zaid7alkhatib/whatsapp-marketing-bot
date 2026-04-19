import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import FormModeBanner from "../components/FormModeBanner";
import ListFilters from "../components/ListFilters";
import PageSection from "../components/PageSection";
import SortableHeader from "../components/SortableHeader";
import StatusBadge from "../components/StatusBadge";
import TablePagination from "../components/TablePagination";
import useClientTable from "../hooks/useClientTable";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface TransitionCondition {
  operator?: string;
  value?: string;
}

interface TransitionRule {
  when?: string | TransitionCondition;
  toStepCode?: string;
  nextStepCode?: string;
}

interface FlowStepRecord {
  _id: string;
  flowId: string;
  code: string;
  type: string;
  sequence: number;
  status: string;
  contentKey?: string;
  stepConfig?: {
    dataKey?: string;
    choiceMap?: Record<string, unknown>;
    orgUnitMap?: Record<string, unknown>;
    [key: string]: unknown;
  };
  transitionConfig?: TransitionRule[];
}

type FlowStepSortKey = "code" | "type" | "sequence" | "status" | "contentKey";

interface FlowRecord {
  _id: string;
  code: string;
  version: number;
}

interface FlowStepCreateFormState {
  flowId: string;
  code: string;
  type: string;
  sequence: string;
  status: string;
  contentKey: string;
  dataKey: string;
  choiceMapRaw: string;
  orgUnitMapRaw: string;
  transitionConfigRaw: string;
}

const STEP_TYPE_OPTIONS = [
  "message",
  "choice",
  "input_text",
  "input_number",
  "input_date",
  "input_phone",
  "multi_field_form",
  "condition",
  "api_action",
  "ai_extract",
  "handoff",
  "end",
];

function createInitialForm(flowId = ""): FlowStepCreateFormState {
  return {
    flowId,
    code: "",
    type: "message",
    sequence: "1",
    status: "active",
    contentKey: "",
    dataKey: "",
    choiceMapRaw: "",
    orgUnitMapRaw: "",
    transitionConfigRaw: "",
  };
}

function getTransitionTarget(rule: TransitionRule): string | undefined {
  if (typeof rule.nextStepCode === "string" && rule.nextStepCode.trim().length > 0) {
    return rule.nextStepCode.trim();
  }

  if (typeof rule.toStepCode === "string" && rule.toStepCode.trim().length > 0) {
    return rule.toStepCode.trim();
  }

  return undefined;
}

function summarizeTransitions(transitionConfig?: TransitionRule[]): string {
  if (!Array.isArray(transitionConfig) || transitionConfig.length === 0) {
    return "-";
  }

  if (transitionConfig.length > 1) {
    return `${transitionConfig.length} transitions`;
  }

  const rule = transitionConfig[0];
  const target = getTransitionTarget(rule);
  if (!target) {
    return "1 transition";
  }

  if (rule.when === "always") {
    return `always -> ${target}`;
  }

  if (typeof rule.when === "object" && rule.when) {
    const operator = typeof rule.when.operator === "string" ? rule.when.operator : "?";
    const value = typeof rule.when.value === "string" ? rule.when.value : "?";
    return `${operator}(${value}) -> ${target}`;
  }

  return `1 transition -> ${target}`;
}

function FlowStepsPage() {
  const [flowSteps, setFlowSteps] = useState<FlowStepRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [flowsErrorMessage, setFlowsErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FlowStepCreateFormState>(createInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [editingStepConfig, setEditingStepConfig] = useState<Record<string, unknown> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadFlowSteps = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowStepRecord[]>>("/api/v1/flow-steps");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load flow steps.");
      }

      setFlowSteps(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load flow steps.");
      } else {
        setErrorMessage("Failed to load flow steps.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFlows = useCallback(async () => {
    setIsLoadingFlows(true);
    setFlowsErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowRecord[]>>("/api/v1/flows");
      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load flows.");
      }

      const nextFlows = Array.isArray(response.data.data) ? response.data.data : [];
      setFlows(nextFlows);

      setForm((previous) => ({
        ...previous,
        flowId: previous.flowId || nextFlows[0]?._id || "",
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setFlowsErrorMessage(apiMessage ?? error.message ?? "Failed to load flows.");
      } else {
        setFlowsErrorMessage("Failed to load flows.");
      }
    } finally {
      setIsLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    void loadFlowSteps();
    void loadFlows();
  }, [loadFlowSteps, loadFlows]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(flowSteps.map((flowStep) => flowStep.status).filter(Boolean))).sort();
  }, [flowSteps]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set(flowSteps.map((flowStep) => flowStep.type).filter(Boolean))).sort();
  }, [flowSteps]);

  const filteredFlowSteps = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return flowSteps.filter((flowStep) => {
      if (statusFilter !== "all" && flowStep.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && flowStep.type !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        flowStep.code,
        flowStep.type,
        flowStep.contentKey,
        flowStep.flowId,
        summarizeTransitions(flowStep.transitionConfig),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [flowSteps, searchTerm, statusFilter, typeFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedFlowSteps,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<FlowStepRecord, FlowStepSortKey>({
    items: filteredFlowSteps,
    initialSortKey: "sequence",
    getSortValue: (flowStep, key) => flowStep[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}|${typeFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.flowId) {
      setSubmitError("flowId is required.");
      return;
    }
    if (!form.code.trim()) {
      setSubmitError("code is required.");
      return;
    }

    const parsedSequence = Number(form.sequence);
    if (!Number.isFinite(parsedSequence) || parsedSequence <= 0) {
      setSubmitError("sequence must be a positive number.");
      return;
    }

    let parsedTransitionConfig: unknown[] | undefined;
    if (form.transitionConfigRaw.trim()) {
      try {
        const parsed = JSON.parse(form.transitionConfigRaw);
        if (!Array.isArray(parsed)) {
          setSubmitError("transitionConfig JSON must be an array.");
          return;
        }
        parsedTransitionConfig = parsed;
      } catch {
        setSubmitError("transitionConfig JSON is invalid.");
        return;
      }
    }

    let parsedChoiceMap: Record<string, unknown> | undefined;
    if (form.choiceMapRaw.trim()) {
      try {
        const parsed = JSON.parse(form.choiceMapRaw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setSubmitError("choiceMap JSON must be an object.");
          return;
        }
        parsedChoiceMap = parsed as Record<string, unknown>;
      } catch {
        setSubmitError("choiceMap JSON is invalid.");
        return;
      }
    }

    let parsedOrgUnitMap: Record<string, unknown> | undefined;
    if (form.orgUnitMapRaw.trim()) {
      try {
        const parsed = JSON.parse(form.orgUnitMapRaw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setSubmitError("orgUnitMap JSON must be an object.");
          return;
        }
        parsedOrgUnitMap = parsed as Record<string, unknown>;
      } catch {
        setSubmitError("orgUnitMap JSON is invalid.");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      flowId: form.flowId,
      code: form.code.trim(),
      type: form.type,
      sequence: parsedSequence,
      status: form.status,
    };

    if (form.contentKey.trim()) {
      payload.contentKey = form.contentKey.trim();
    }

    const stepConfigPayload: Record<string, unknown> = {};
    if (editingStepConfig) {
      for (const [key, value] of Object.entries(editingStepConfig)) {
        if (key === "dataKey" || key === "choiceMap" || key === "orgUnitMap") {
          continue;
        }
        stepConfigPayload[key] = value;
      }
    }

    if (form.dataKey.trim()) {
      stepConfigPayload.dataKey = form.dataKey.trim();
    } else {
      delete stepConfigPayload.dataKey;
    }

    if (parsedChoiceMap) {
      stepConfigPayload.choiceMap = parsedChoiceMap;
    } else {
      delete stepConfigPayload.choiceMap;
    }

    if (parsedOrgUnitMap) {
      stepConfigPayload.orgUnitMap = parsedOrgUnitMap;
    } else {
      delete stepConfigPayload.orgUnitMap;
    }

    if (Object.keys(stepConfigPayload).length > 0) {
      payload.stepConfig = stepConfigPayload;
    }

    if (parsedTransitionConfig) {
      payload.transitionConfig = parsedTransitionConfig;
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/flow-steps/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/flow-steps", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ??
            (isEditMode ? "Failed to update flow step." : "Failed to create flow step.")
        );
      }

      setSubmitSuccess(isEditMode ? "Flow step updated successfully." : "Flow step created successfully.");
      setForm(createInitialForm(flows[0]?._id || form.flowId));
      setEditingId(null);
      setEditingStepConfig(null);
      await loadFlowSteps();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save flow step.");
      } else {
        setSubmitError("Failed to save flow step.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (flowStep: FlowStepRecord) => {
    setEditingId(flowStep._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      flowId: flowStep.flowId,
      code: flowStep.code,
      type: flowStep.type,
      sequence: String(flowStep.sequence),
      status: flowStep.status,
      contentKey: flowStep.contentKey ?? "",
      dataKey: flowStep.stepConfig?.dataKey ?? "",
      choiceMapRaw:
        flowStep.stepConfig?.choiceMap &&
        typeof flowStep.stepConfig.choiceMap === "object" &&
        !Array.isArray(flowStep.stepConfig.choiceMap)
          ? JSON.stringify(flowStep.stepConfig.choiceMap, null, 2)
          : "",
      orgUnitMapRaw:
        flowStep.stepConfig?.orgUnitMap &&
        typeof flowStep.stepConfig.orgUnitMap === "object" &&
        !Array.isArray(flowStep.stepConfig.orgUnitMap)
          ? JSON.stringify(flowStep.stepConfig.orgUnitMap, null, 2)
          : "",
      transitionConfigRaw: Array.isArray(flowStep.transitionConfig)
        ? JSON.stringify(flowStep.transitionConfig, null, 2)
        : "",
    });
    setEditingStepConfig(flowStep.stepConfig ? { ...flowStep.stepConfig } : null);
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setEditingStepConfig(null);
    setSubmitError(null);
    setForm(createInitialForm(flows[0]?._id || ""));
  };

  return (
    <PageSection
      title="Flow Steps"
      description="Flow step definitions loaded from the backend."
      onRefresh={() => {
        void loadFlowSteps();
        void loadFlows();
      }}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Flow Step" editingId={editingId} />
        <div className="form-grid">
          <label className="form-field">
            <span>Flow</span>
            <select
              className="input-control"
              value={form.flowId}
              onChange={(event) => setForm((previous) => ({ ...previous, flowId: event.target.value }))}
              required
              disabled={isLoadingFlows}
            >
              <option value="">Select flow</option>
              {flows.map((flow) => (
                <option key={flow._id} value={flow._id}>
                  {flow.code} v{flow.version}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Code</span>
            <input
              className="input-control"
              type="text"
              value={form.code}
              onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Type</span>
            <select
              className="input-control"
              value={form.type}
              onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}
            >
              {STEP_TYPE_OPTIONS.map((stepType) => (
                <option key={stepType} value={stepType}>
                  {stepType}
                </option>
              ))}
            </select>
            <small className="form-help">Use metadata-driven step types. Avoid flow-specific hardcoding.</small>
          </label>

          <label className="form-field">
            <span>Sequence</span>
            <input
              className="input-control"
              type="number"
              min={1}
              value={form.sequence}
              onChange={(event) => setForm((previous) => ({ ...previous, sequence: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Status</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label className="form-field">
            <span>Content Key</span>
            <input
              className="input-control"
              type="text"
              value={form.contentKey}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contentKey: event.target.value }))
              }
              placeholder="optional"
            />
          </label>

          <label className="form-field">
            <span>Data Key</span>
            <input
              className="input-control"
              type="text"
              value={form.dataKey}
              onChange={(event) => setForm((previous) => ({ ...previous, dataKey: event.target.value }))}
              placeholder="optional"
            />
            <small className="form-help">Stores user input into session.collectedData[dataKey].</small>
          </label>

          {form.type === "choice" ? (
            <>
              <label className="form-field form-field-full">
                <span>Choice Map JSON</span>
                <textarea
                  className="input-control text-area-control"
                  value={form.choiceMapRaw}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, choiceMapRaw: event.target.value }))
                  }
                  placeholder='optional, example: {"1":"clinic_a","2":"clinic_b"}'
                />
                <small className="form-help">
                  Enter a JSON object for semantic mapping of choice inputs.
                </small>
              </label>

              <label className="form-field form-field-full">
                <span>Org Unit Map JSON</span>
                <textarea
                  className="input-control text-area-control"
                  value={form.orgUnitMapRaw}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, orgUnitMapRaw: event.target.value }))
                  }
                  placeholder='optional, example: {"clinic_a":"<ORG_UNIT_ID_A>","clinic_b":"<ORG_UNIT_ID_B>"}'
                />
                <small className="form-help">
                  Enter a JSON object mapping semantic choice values to orgUnitId strings.
                </small>
              </label>
            </>
          ) : null}

          <label className="form-field form-field-full">
            <span>Transition Config JSON</span>
            <textarea
              className="input-control text-area-control"
              value={form.transitionConfigRaw}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, transitionConfigRaw: event.target.value }))
              }
              placeholder='optional, example: [{"when":"always","toStepCode":"END"}]'
            />
            <small className="form-help">
              {'Enter a JSON array. Example: [{"when":{"operator":"eq","value":"en"},"nextStepCode":"NEXT"}]'}
            </small>
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting || isLoadingFlows}>
            {isSubmitting
              ? "Submitting..."
              : editingId
              ? "Update Flow Step"
              : "Create Flow Step"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {flowsErrorMessage ? (
        <div className="state-block state-error">
          <p>{flowsErrorMessage}</p>
        </div>
      ) : null}

      {submitError ? (
        <div className="state-block state-error">
          <p>{submitError}</p>
        </div>
      ) : null}

      {submitSuccess ? (
        <div className="state-block state-success">
          <p>{submitSuccess}</p>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by code, type, content key, flow id or transitions..."
        filteredCount={filteredFlowSteps.length}
        totalCount={flowSteps.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setTypeFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>Status</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Type</span>
          <select
            className="input-control"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading flow steps...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && flowSteps.length === 0 ? (
        <div className="state-block state-empty">
          <p>No flow steps found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && flowSteps.length > 0 && filteredFlowSteps.length === 0 ? (
        <div className="state-block state-empty">
          <p>No flow steps match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredFlowSteps.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Flow ID</th>
                  <SortableHeader
                    label="Code"
                    sortKeyValue="code"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Type"
                    sortKeyValue="type"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Sequence"
                    sortKeyValue="sequence"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Status"
                    sortKeyValue="status"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Content Key"
                    sortKeyValue="contentKey"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Transitions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFlowSteps.map((flowStep) => (
                  <tr key={flowStep._id}>
                    <td className="cell-mono">{flowStep._id}</td>
                    <td className="cell-mono">{flowStep.flowId}</td>
                    <td>{flowStep.code}</td>
                    <td>{flowStep.type}</td>
                    <td>{flowStep.sequence}</td>
                    <td>
                      <StatusBadge value={flowStep.status} />
                    </td>
                    <td>{flowStep.contentKey || "-"}</td>
                    <td>{summarizeTransitions(flowStep.transitionConfig)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(flowStep)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePagination
            totalItems={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            startItem={startItem}
            endItem={endItem}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      ) : null}
    </PageSection>
  );
}

export default FlowStepsPage;
