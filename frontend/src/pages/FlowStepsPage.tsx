import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import FormModeBanner from "../components/FormModeBanner";
import InlineAlert from "../components/InlineAlert";
import ListFilters from "../components/ListFilters";
import LoadingState from "../components/LoadingState";
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

interface FlowMessageRecord {
  key: string;
  linkedStepCodes: string[];
  usedInSteps: number;
  configured: boolean;
  contentType: string;
  status: string;
  translations: {
    ar: string;
    en: string;
    de: string;
  };
}

interface FlowMessagesResponse {
  flow: FlowRecord;
  messages: FlowMessageRecord[];
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

interface ChoiceOptionRow {
  id: string;
  userReply: string;
  savedValue: string;
  nextStepCode: string;
  orgUnitId: string;
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

const CLIENT_STEP_TYPE_OPTIONS = ["message", "choice", "input_text", "end"];

const STEP_TYPE_LABELS: Record<string, string> = {
  message: "Send message",
  choice: "Ask for a choice",
  input_text: "Collect text or media",
  input_number: "Collect number",
  input_date: "Collect date",
  input_phone: "Collect phone",
  multi_field_form: "Multi-field form",
  condition: "Conditional branch",
  api_action: "API action",
  ai_extract: "AI extract",
  handoff: "Handoff",
  end: "End conversation",
};

const STEP_TYPE_HELP: Record<string, string> = {
  message: "Sends a message to the person, then continues to the next configured step.",
  choice: "Shows numbered options and routes the person based on the reply they send back.",
  input_text:
    "Waits for a typed answer or an uploaded file/image, then stores the result in a named field.",
  end: "Closes the conversation. Use this when the clinic flow should stop.",
};

function createInitialForm(flowId = "", sequence = "1"): FlowStepCreateFormState {
  return {
    flowId,
    code: "",
    type: "message",
    sequence,
    status: "active",
    contentKey: "",
    dataKey: "",
    choiceMapRaw: "",
    orgUnitMapRaw: "",
    transitionConfigRaw: "",
  };
}

function createChoiceOptionRow(seed?: Partial<Omit<ChoiceOptionRow, "id">>): ChoiceOptionRow {
  return {
    id: `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userReply: seed?.userReply ?? "",
    savedValue: seed?.savedValue ?? "",
    nextStepCode: seed?.nextStepCode ?? "",
    orgUnitId: seed?.orgUnitId ?? "",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function getStepTypeLabel(stepType: string): string {
  return STEP_TYPE_LABELS[stepType] ?? stepType;
}

function getStepTypeHelp(stepType: string): string {
  return (
    STEP_TYPE_HELP[stepType] ??
    "Use this step type only when you understand the required runtime behavior."
  );
}

function getFirstAvailableTranslation(message?: FlowMessageRecord): string {
  if (!message) {
    return "";
  }

  const candidates = [message.translations.ar, message.translations.en, message.translations.de];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "";
}

function toChoiceMapRecord(step?: FlowStepRecord): Record<string, unknown> {
  return isPlainObject(step?.stepConfig?.choiceMap) ? step?.stepConfig?.choiceMap ?? {} : {};
}

function toOrgUnitMapRecord(step?: FlowStepRecord): Record<string, unknown> {
  return isPlainObject(step?.stepConfig?.orgUnitMap) ? step?.stepConfig?.orgUnitMap ?? {} : {};
}

function deriveSimpleNextStep(transitionConfig?: TransitionRule[]): {
  nextStepCode: string;
  requiresAdvanced: boolean;
} {
  if (!Array.isArray(transitionConfig) || transitionConfig.length === 0) {
    return { nextStepCode: "", requiresAdvanced: false };
  }

  if (transitionConfig.length === 1) {
    const onlyRule = transitionConfig[0];
    const target = getTransitionTarget(onlyRule);
    if (onlyRule.when === "always" && target) {
      return { nextStepCode: target, requiresAdvanced: false };
    }
  }

  return { nextStepCode: "", requiresAdvanced: true };
}

function deriveChoiceEditorState(step?: FlowStepRecord): {
  rows: ChoiceOptionRow[];
  requiresAdvanced: boolean;
} {
  const choiceMap = toChoiceMapRecord(step);
  const orgUnitMap = toOrgUnitMapRecord(step);
  const transitionConfig = Array.isArray(step?.transitionConfig) ? step?.transitionConfig : [];

  let requiresAdvanced = false;
  const simpleTransitions: Array<{ whenValue: string; nextStepCode: string }> = [];

  for (const rule of transitionConfig) {
    const target = getTransitionTarget(rule);
    if (!target) {
      requiresAdvanced = true;
      continue;
    }

    if (
      typeof rule.when === "object" &&
      rule.when &&
      rule.when.operator === "eq" &&
      typeof rule.when.value === "string" &&
      rule.when.value.trim().length > 0
    ) {
      simpleTransitions.push({ whenValue: rule.when.value.trim(), nextStepCode: target });
      continue;
    }

    requiresAdvanced = true;
  }

  const transitionTargetsByValue = new Map<string, string>();
  for (const item of simpleTransitions) {
    transitionTargetsByValue.set(item.whenValue, item.nextStepCode);
  }

  const matchedTransitionValues = new Set<string>();
  const rows: ChoiceOptionRow[] = [];

  for (const [userReply, mappedValue] of Object.entries(choiceMap)) {
    if (typeof mappedValue !== "string") {
      requiresAdvanced = true;
      continue;
    }

    const normalizedReply = userReply.trim();
    const normalizedValue = mappedValue.trim();
    const target =
      transitionTargetsByValue.get(normalizedReply) ??
      transitionTargetsByValue.get(normalizedValue) ??
      "";

    if (transitionTargetsByValue.has(normalizedReply)) {
      matchedTransitionValues.add(normalizedReply);
    }
    if (transitionTargetsByValue.has(normalizedValue)) {
      matchedTransitionValues.add(normalizedValue);
    }

    const mappedOrgUnit = orgUnitMap[normalizedValue];
    rows.push(
      createChoiceOptionRow({
        userReply: normalizedReply,
        savedValue: normalizedValue,
        nextStepCode: target,
        orgUnitId: typeof mappedOrgUnit === "string" ? mappedOrgUnit.trim() : "",
      })
    );
  }

  if (rows.length === 0) {
    for (const transition of simpleTransitions) {
      matchedTransitionValues.add(transition.whenValue);
      rows.push(
        createChoiceOptionRow({
          userReply: transition.whenValue,
          savedValue: transition.whenValue,
          nextStepCode: transition.nextStepCode,
          orgUnitId:
            typeof orgUnitMap[transition.whenValue] === "string"
              ? String(orgUnitMap[transition.whenValue]).trim()
              : "",
        })
      );
    }
  }

  for (const transition of simpleTransitions) {
    if (matchedTransitionValues.has(transition.whenValue)) {
      continue;
    }

    rows.push(
      createChoiceOptionRow({
        userReply: transition.whenValue,
        savedValue: transition.whenValue,
        nextStepCode: transition.nextStepCode,
        orgUnitId:
          typeof orgUnitMap[transition.whenValue] === "string"
            ? String(orgUnitMap[transition.whenValue]).trim()
            : "",
      })
    );
  }

  for (const value of Object.values(orgUnitMap)) {
    if (typeof value !== "string") {
      requiresAdvanced = true;
      break;
    }
  }

  return {
    rows: rows.length > 0 ? rows : [createChoiceOptionRow()],
    requiresAdvanced,
  };
}

function getChoiceOptionSummary(rows: ChoiceOptionRow[]): string[] {
  return rows
    .map((row) => ({
      userReply: row.userReply.trim(),
      savedValue: row.savedValue.trim(),
      nextStepCode: row.nextStepCode.trim(),
    }))
    .filter((row) => row.userReply || row.savedValue || row.nextStepCode)
    .map((row) => {
      const savedValue = row.savedValue || row.userReply;
      if (!row.userReply && !savedValue) {
        return "";
      }

      if (savedValue && savedValue !== row.userReply) {
        return `${row.userReply} -> save ${savedValue}${
          row.nextStepCode ? ` -> ${row.nextStepCode}` : ""
        }`;
      }

      return `${row.userReply}${row.nextStepCode ? ` -> ${row.nextStepCode}` : ""}`;
    })
    .filter(Boolean);
}

function buildClientStepSummary(
  flowStep: FlowStepRecord,
  choiceRows: ChoiceOptionRow[],
  nextStepState: { nextStepCode: string; requiresAdvanced: boolean }
): string {
  const dataKey =
    typeof flowStep.stepConfig?.dataKey === "string" ? flowStep.stepConfig.dataKey.trim() : "";

  switch (flowStep.type) {
    case "message":
      return nextStepState.nextStepCode
        ? `Sends a message, then continues to ${nextStepState.nextStepCode}.`
        : "Sends a message in the conversation.";
    case "choice": {
      const optionCount = choiceRows.filter(
        (row) => row.userReply.trim() || row.savedValue.trim() || row.nextStepCode.trim()
      ).length;
      const storeSummary = dataKey ? ` and stores the selection in ${dataKey}` : "";
      return `Asks the person to choose between ${optionCount || 0} option${
        optionCount === 1 ? "" : "s"
      }${storeSummary}.`;
    }
    case "input_text":
      return dataKey
        ? `Collects a typed or uploaded reply and stores it in ${dataKey}${
            nextStepState.nextStepCode ? `, then continues to ${nextStepState.nextStepCode}` : ""
          }.`
        : `Collects a typed or uploaded reply${
            nextStepState.nextStepCode ? `, then continues to ${nextStepState.nextStepCode}` : ""
          }.`;
    case "end":
      return "Ends the conversation.";
    default:
      return `Uses the ${flowStep.type} step type.`;
  }
}

function FlowStepsPage() {
  const { user } = useAuth();
  const isClientRole = user?.role === "user";

  const [flowSteps, setFlowSteps] = useState<FlowStepRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [flowsErrorMessage, setFlowsErrorMessage] = useState<string | null>(null);

  const [clientMessages, setClientMessages] = useState<FlowMessageRecord[]>([]);
  const [isLoadingClientMessages, setIsLoadingClientMessages] = useState(false);
  const [clientMessagesError, setClientMessagesError] = useState<string | null>(null);

  const [form, setForm] = useState<FlowStepCreateFormState>(createInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingStepId, setIsDeletingStepId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [editingStepConfig, setEditingStepConfig] = useState<Record<string, unknown> | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [nextStepCode, setNextStepCode] = useState("");
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOptionRow[]>([createChoiceOptionRow()]);
  const [useAdvancedTransitionEditor, setUseAdvancedTransitionEditor] = useState(false);
  const [advancedEditorNotice, setAdvancedEditorNotice] = useState<string | null>(null);

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

  const loadClientMessages = useCallback(async () => {
    if (!isClientRole) {
      setClientMessages([]);
      setClientMessagesError(null);
      setIsLoadingClientMessages(false);
      return;
    }

    setIsLoadingClientMessages(true);
    setClientMessagesError(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowMessagesResponse>>(
        "/api/v1/client/flow-messages"
      );
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load scoped flow messages.");
      }

      setClientMessages(Array.isArray(response.data.data.messages) ? response.data.data.messages : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setClientMessagesError(apiMessage ?? error.message ?? "Failed to load scoped flow messages.");
      } else {
        setClientMessagesError("Failed to load scoped flow messages.");
      }
    } finally {
      setIsLoadingClientMessages(false);
    }
  }, [isClientRole]);

  useEffect(() => {
    void loadFlowSteps();
    void loadFlows();
  }, [loadFlowSteps, loadFlows]);

  useEffect(() => {
    void loadClientMessages();
  }, [loadClientMessages]);

  const activeFlowId = form.flowId || flows[0]?._id || "";

  const suggestedSequence = useMemo(() => {
    const scopedSteps = flowSteps.filter((flowStep) => !activeFlowId || flowStep.flowId === activeFlowId);
    const highestSequence = scopedSteps.reduce(
      (highest, flowStep) => Math.max(highest, Number(flowStep.sequence) || 0),
      0
    );

    return String(Math.max(1, highestSequence + 1));
  }, [activeFlowId, flowSteps]);

  const visibleStepTypeOptions = useMemo(() => {
    if (!isClientRole) {
      return STEP_TYPE_OPTIONS;
    }

    return CLIENT_STEP_TYPE_OPTIONS.includes(form.type)
      ? CLIENT_STEP_TYPE_OPTIONS
      : [...CLIENT_STEP_TYPE_OPTIONS, form.type];
  }, [form.type, isClientRole]);

  const clientMessagesByKey = useMemo(() => {
    return new Map(clientMessages.map((message) => [message.key, message] as const));
  }, [clientMessages]);

  const choiceStateByStepId = useMemo(() => {
    const stateById = new Map<string, { rows: ChoiceOptionRow[]; requiresAdvanced: boolean }>();
    for (const flowStep of flowSteps) {
      if (flowStep.type === "choice") {
        stateById.set(flowStep._id, deriveChoiceEditorState(flowStep));
      }
    }
    return stateById;
  }, [flowSteps]);

  const nextStepStateByStepId = useMemo(() => {
    const stateById = new Map<string, { nextStepCode: string; requiresAdvanced: boolean }>();
    for (const flowStep of flowSteps) {
      if (flowStep.type !== "choice") {
        stateById.set(flowStep._id, deriveSimpleNextStep(flowStep.transitionConfig));
      }
    }
    return stateById;
  }, [flowSteps]);

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

      const linkedMessage = flowStep.contentKey ? clientMessagesByKey.get(flowStep.contentKey) : undefined;
      const messagePreview = getFirstAvailableTranslation(linkedMessage);
      const dataKey = typeof flowStep.stepConfig?.dataKey === "string" ? flowStep.stepConfig.dataKey : "";
      const choiceSummary =
        flowStep.type === "choice"
          ? getChoiceOptionSummary(choiceStateByStepId.get(flowStep._id)?.rows ?? []).join(" ")
          : "";

      const searchableText = [
        flowStep.code,
        flowStep.type,
        flowStep.contentKey,
        flowStep.flowId,
        dataKey,
        messagePreview,
        summarizeTransitions(flowStep.transitionConfig),
        choiceSummary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [
    choiceStateByStepId,
    clientMessagesByKey,
    flowSteps,
    searchTerm,
    statusFilter,
    typeFilter,
  ]);

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

  const currentMessagePreview = useMemo(() => {
    if (!isClientRole || !form.contentKey.trim()) {
      return null;
    }

    return clientMessagesByKey.get(form.contentKey.trim()) ?? null;
  }, [clientMessagesByKey, form.contentKey, isClientRole]);

  const scopedFlow = flows[0] ?? null;
  const firstScopedStep = useMemo(() => {
    if (flowSteps.length === 0) {
      return null;
    }

    return [...flowSteps].sort((left, right) => left.sequence - right.sequence)[0] ?? null;
  }, [flowSteps]);

  const configuredMessageCount = useMemo(
    () => clientMessages.filter((message) => message.configured).length,
    [clientMessages]
  );

  const resetEditor = useCallback(
    (flowId?: string, sequence?: string) => {
      setEditingId(null);
      setEditingStepConfig(null);
      setSubmitError(null);
      setSubmitSuccess(null);
      setForm(createInitialForm(flowId ?? flows[0]?._id ?? "", sequence ?? suggestedSequence));
      setNextStepCode("");
      setChoiceOptions([createChoiceOptionRow()]);
      setUseAdvancedTransitionEditor(false);
      setAdvancedEditorNotice(null);
    },
    [flows, suggestedSequence]
  );

  const handleTypeChange = (nextType: string) => {
    setForm((previous) => ({ ...previous, type: nextType }));
    setSubmitError(null);
    setSubmitSuccess(null);

    if (nextType === "choice" && choiceOptions.length === 0) {
      setChoiceOptions([createChoiceOptionRow()]);
    }

    if (nextType === "end") {
      setNextStepCode("");
    }

    if (!isClientRole) {
      return;
    }

    if (nextType !== "choice") {
      setAdvancedEditorNotice(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.flowId) {
      setSubmitError("flowId is required.");
      return;
    }
    if (!form.code.trim()) {
      setSubmitError("Step code is required.");
      return;
    }

    const parsedSequence = Number(form.sequence);
    if (!Number.isFinite(parsedSequence) || parsedSequence <= 0) {
      setSubmitError("sequence must be a positive number.");
      return;
    }

    let parsedTransitionConfig: unknown[] | undefined;
    let parsedChoiceMap: Record<string, unknown> | undefined;
    let parsedOrgUnitMap: Record<string, unknown> | undefined;

    if (isClientRole && form.type === "choice") {
      const normalizedRows = choiceOptions
        .map((row) => ({
          userReply: row.userReply.trim(),
          savedValue: row.savedValue.trim() || row.userReply.trim(),
          nextStepCode: row.nextStepCode.trim(),
          orgUnitId: row.orgUnitId.trim(),
        }))
        .filter((row) => row.userReply || row.savedValue || row.nextStepCode || row.orgUnitId);

      if (normalizedRows.length === 0) {
        setSubmitError("Add at least one choice option.");
        return;
      }

      for (const row of normalizedRows) {
        if (!row.userReply) {
          setSubmitError("Each choice option needs the user reply value.");
          return;
        }
        if (!row.nextStepCode && !useAdvancedTransitionEditor) {
          setSubmitError(`Choice option '${row.userReply}' needs a next step code.`);
          return;
        }
      }

      parsedChoiceMap = Object.fromEntries(
        normalizedRows.map((row) => [row.userReply, row.savedValue])
      );

      const orgUnitEntries = normalizedRows.filter((row) => row.orgUnitId);
      if (orgUnitEntries.length > 0) {
        parsedOrgUnitMap = Object.fromEntries(
          orgUnitEntries.map((row) => [row.savedValue, row.orgUnitId])
        );
      }

      if (useAdvancedTransitionEditor) {
        if (form.transitionConfigRaw.trim()) {
          try {
            const parsed = JSON.parse(form.transitionConfigRaw);
            if (!Array.isArray(parsed)) {
              setSubmitError("Advanced transition JSON must be an array.");
              return;
            }
            parsedTransitionConfig = parsed;
          } catch {
            setSubmitError("Advanced transition JSON is invalid.");
            return;
          }
        }
      } else {
        parsedTransitionConfig = normalizedRows.map((row) => ({
          when: {
            operator: "eq",
            value: row.userReply,
          },
          nextStepCode: row.nextStepCode,
        }));
      }
    } else if (isClientRole) {
      if (useAdvancedTransitionEditor) {
        if (form.transitionConfigRaw.trim()) {
          try {
            const parsed = JSON.parse(form.transitionConfigRaw);
            if (!Array.isArray(parsed)) {
              setSubmitError("Advanced transition JSON must be an array.");
              return;
            }
            parsedTransitionConfig = parsed;
          } catch {
            setSubmitError("Advanced transition JSON is invalid.");
            return;
          }
        }
      } else if (form.type !== "end" && nextStepCode.trim()) {
        parsedTransitionConfig = [{ when: "always", toStepCode: nextStepCode.trim() }];
      }
    } else {
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

      if (form.choiceMapRaw.trim()) {
        try {
          const parsed = JSON.parse(form.choiceMapRaw);
          if (!isPlainObject(parsed)) {
            setSubmitError("choiceMap JSON must be an object.");
            return;
          }
          parsedChoiceMap = parsed;
        } catch {
          setSubmitError("choiceMap JSON is invalid.");
          return;
        }
      }

      if (form.orgUnitMapRaw.trim()) {
        try {
          const parsed = JSON.parse(form.orgUnitMapRaw);
          if (!isPlainObject(parsed)) {
            setSubmitError("orgUnitMap JSON must be an object.");
            return;
          }
          parsedOrgUnitMap = parsed;
        } catch {
          setSubmitError("orgUnitMap JSON is invalid.");
          return;
        }
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

      setSubmitSuccess(
        isEditMode ? "Flow step updated successfully." : "Flow step created successfully."
      );
      await loadFlowSteps();
      if (isClientRole) {
        await loadClientMessages();
      }
      resetEditor(form.flowId, String(parsedSequence + 1));
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
        flowStep.stepConfig?.choiceMap && isPlainObject(flowStep.stepConfig.choiceMap)
          ? JSON.stringify(flowStep.stepConfig.choiceMap, null, 2)
          : "",
      orgUnitMapRaw:
        flowStep.stepConfig?.orgUnitMap && isPlainObject(flowStep.stepConfig.orgUnitMap)
          ? JSON.stringify(flowStep.stepConfig.orgUnitMap, null, 2)
          : "",
      transitionConfigRaw: Array.isArray(flowStep.transitionConfig)
        ? JSON.stringify(flowStep.transitionConfig, null, 2)
        : "",
    });
    setEditingStepConfig(flowStep.stepConfig ? { ...flowStep.stepConfig } : null);

    if (flowStep.type === "choice") {
      const choiceState = deriveChoiceEditorState(flowStep);
      setChoiceOptions(choiceState.rows);
      setUseAdvancedTransitionEditor(choiceState.requiresAdvanced);
      setAdvancedEditorNotice(
        choiceState.requiresAdvanced
          ? "This step already uses routing rules that need the advanced JSON editor."
          : null
      );
      setNextStepCode("");
    } else {
      const nextState = deriveSimpleNextStep(flowStep.transitionConfig);
      setNextStepCode(nextState.nextStepCode);
      setChoiceOptions([createChoiceOptionRow()]);
      setUseAdvancedTransitionEditor(nextState.requiresAdvanced);
      setAdvancedEditorNotice(
        nextState.requiresAdvanced
          ? "This step already uses advanced transitions. Keep the JSON editor open so nothing is lost."
          : null
      );
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleDeleteStep = useCallback(
    async (flowStep: FlowStepRecord) => {
      const confirmMessage = isClientRole
        ? `Delete step ${flowStep.code}? This removes the step from the clinic flow, but keeps any linked message text saved separately.`
        : `Delete flow step ${flowStep.code}?`;

      if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
        return;
      }

      setIsDeletingStepId(flowStep._id);
      setSubmitError(null);
      setSubmitSuccess(null);

      try {
        const response = await api.delete<ApiSuccessResponse<{ key?: string }>>(
          `/api/v1/flow-steps/${flowStep._id}`
        );

        if (!response.data.success) {
          throw new Error(response.data.message ?? "Failed to delete flow step.");
        }

        await loadFlowSteps();
        if (isClientRole) {
          await loadClientMessages();
        }

        if (editingId === flowStep._id) {
          resetEditor(flowStep.flowId);
        }

        setSubmitSuccess(`Deleted step ${flowStep.code}.`);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setSubmitError(apiMessage ?? error.message ?? "Failed to delete flow step.");
        } else {
          setSubmitError("Failed to delete flow step.");
        }
      } finally {
        setIsDeletingStepId(null);
      }
    },
    [editingId, isClientRole, loadClientMessages, loadFlowSteps, resetEditor]
  );

  const linkedMessagePreview = (contentKey?: string) => {
    if (!contentKey) {
      return null;
    }

    return clientMessagesByKey.get(contentKey) ?? null;
  };

  return (
    <PageSection
      title="Flow Steps"
      description={
        isClientRole
          ? "Manage the approved clinic flow step by step without leaving the client workspace."
          : "Flow step definitions loaded from the backend."
      }
      onRefresh={() => {
        void loadFlowSteps();
        void loadFlows();
        if (isClientRole) {
          void loadClientMessages();
        }
      }}
    >
      {isClientRole && scopedFlow ? (
        <div className="client-flow-summary-card">
          <div className="client-flow-summary-copy">
            <p className="client-flow-summary-kicker">Scoped clinic flow</p>
            <h3 className="client-flow-summary-title">{`${scopedFlow.code} v${scopedFlow.version}`}</h3>
            <p className="client-flow-summary-description">
              Keep this one clinic flow understandable: write the visible message text in Flow
              Messages, then adjust step order and routing here only when the conversation logic
              needs to change.
            </p>
            <div className="form-actions">
              <Link to="/flow-messages" className="secondary-button button-link">
                Open Flow Messages
              </Link>
            </div>
          </div>

          <div className="client-flow-summary-stats">
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Total steps</span>
              <strong>{flowSteps.length}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Start step</span>
              <strong>{firstScopedStep?.code ?? "-"}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Configured messages</span>
              <strong>{configuredMessageCount}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Missing messages</span>
              <strong>{clientMessages.length - configuredMessageCount}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Flow Step" editingId={editingId} />

        {isClientRole ? (
          <div className="client-form-guidance">
            <p className="form-subtitle">
              Use the step editor below to add or adjust one clinic flow. For a new prompt message,
              enter a new message key here, save the step, then open <code>Flow Messages</code> to
              write the visible text.
            </p>
          </div>
        ) : null}

        <div className="form-grid">
          {isClientRole ? (
            <label className="form-field">
              <span>Scoped Flow</span>
              <div className="input-control readonly-control">
                {scopedFlow ? `${scopedFlow.code} v${scopedFlow.version}` : "No scoped flow configured"}
              </div>
            </label>
          ) : (
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
          )}

          <label className="form-field">
            <span>{isClientRole ? "Step code" : "Code"}</span>
            <input
              className="input-control"
              type="text"
              value={form.code}
              onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))}
              required
              placeholder={isClientRole ? "Example: ASK_INSURANCE_CARD_IMAGE" : undefined}
            />
            {isClientRole ? (
              <small className="form-help">
                This is the internal step name used for routing. Use caps and underscores.
              </small>
            ) : null}
          </label>

          <label className="form-field">
            <span>Type</span>
            <select
              className="input-control"
              value={form.type}
              onChange={(event) => handleTypeChange(event.target.value)}
            >
              {visibleStepTypeOptions.map((stepType) => (
                <option key={stepType} value={stepType}>
                  {isClientRole ? getStepTypeLabel(stepType) : stepType}
                </option>
              ))}
            </select>
            <small className="form-help">
              {isClientRole
                ? getStepTypeHelp(form.type)
                : "Use metadata-driven step types. Avoid flow-specific hardcoding."}
            </small>
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
            {isClientRole ? (
              <small className="form-help">
                Suggested next position: {suggestedSequence}. Sequence controls the order in which
                the flow runs.
              </small>
            ) : null}
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

          {(form.type === "message" || form.type === "choice" || form.type === "input_text" || !isClientRole) ? (
            <label className="form-field">
              <span>{isClientRole ? "Message key" : "Content Key"}</span>
              <input
                className="input-control"
                type="text"
                value={form.contentKey}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, contentKey: event.target.value }))
                }
                placeholder={isClientRole ? "Example: ask_insurance_card_image" : "optional"}
              />
              <small className="form-help">
                {isClientRole
                  ? "Use an existing message key or create a new one, then write the visible text in Flow Messages."
                  : "Optional message template key for this step."}
              </small>
            </label>
          ) : null}

          {(form.type === "choice" || form.type === "input_text" || !isClientRole) ? (
            <label className="form-field">
              <span>{isClientRole ? "Saved field" : "Data Key"}</span>
              <input
                className="input-control"
                type="text"
                value={form.dataKey}
                onChange={(event) => setForm((previous) => ({ ...previous, dataKey: event.target.value }))}
                placeholder={isClientRole ? "Example: insurance_card_image" : "optional"}
              />
              <small className="form-help">
                {isClientRole
                  ? "Stores the answer under this name so the clinic can use it later in the request."
                  : "Stores user input into session.collectedData[dataKey]."}
              </small>
            </label>
          ) : null}
        </div>

        {isClientRole && currentMessagePreview ? (
          <div className="client-message-preview-card">
            <span className="client-message-preview-label">Current message preview</span>
            <strong>{currentMessagePreview.key}</strong>
            <p>
              {getFirstAvailableTranslation(currentMessagePreview) ||
                "This message key exists but does not have visible text yet."}
            </p>
          </div>
        ) : null}

        {isClientRole && form.type === "choice" ? (
          <div className="client-form-section">
            <div className="client-form-section-header">
              <div>
                <h3 className="form-title">Choice options</h3>
                <p className="form-subtitle">
                  Define what the person sends back, what value gets stored, and which step comes next.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setChoiceOptions((previous) => [...previous, createChoiceOptionRow()])}
              >
                Add choice option
              </button>
            </div>

            <div className="client-choice-builder">
              {choiceOptions.map((row, index) => (
                <div className="client-choice-card" key={row.id}>
                  <div className="client-choice-card-header">
                    <strong>{`Option ${index + 1}`}</strong>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setChoiceOptions((previous) =>
                          previous.length === 1
                            ? [createChoiceOptionRow()]
                            : previous.filter((optionRow) => optionRow.id !== row.id)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>

                  <div className="form-grid">
                    <label className="form-field">
                      <span>User reply</span>
                      <input
                        className="input-control"
                        type="text"
                        value={row.userReply}
                        onChange={(event) =>
                          setChoiceOptions((previous) =>
                            previous.map((optionRow) =>
                              optionRow.id === row.id
                                ? { ...optionRow, userReply: event.target.value }
                                : optionRow
                            )
                          )
                        }
                        placeholder="Example: 1"
                      />
                    </label>

                    <label className="form-field">
                      <span>Saved value</span>
                      <input
                        className="input-control"
                        type="text"
                        value={row.savedValue}
                        onChange={(event) =>
                          setChoiceOptions((previous) =>
                            previous.map((optionRow) =>
                              optionRow.id === row.id
                                ? { ...optionRow, savedValue: event.target.value }
                                : optionRow
                            )
                          )
                        }
                        placeholder="Example: yes"
                      />
                      <small className="form-help">
                        Leave blank to save the same value as the user reply.
                      </small>
                    </label>

                    <label className="form-field">
                      <span>Next step code</span>
                      <input
                        className="input-control"
                        type="text"
                        value={row.nextStepCode}
                        onChange={(event) =>
                          setChoiceOptions((previous) =>
                            previous.map((optionRow) =>
                              optionRow.id === row.id
                                ? { ...optionRow, nextStepCode: event.target.value }
                                : optionRow
                            )
                          )
                        }
                        placeholder="Example: CHOOSE_REQUEST_TYPE"
                      />
                    </label>

                    <label className="form-field">
                      <span>Org unit id (optional)</span>
                      <input
                        className="input-control"
                        type="text"
                        value={row.orgUnitId}
                        onChange={(event) =>
                          setChoiceOptions((previous) =>
                            previous.map((optionRow) =>
                              optionRow.id === row.id
                                ? { ...optionRow, orgUnitId: event.target.value }
                                : optionRow
                            )
                          )
                        }
                        placeholder="Only for clinic-mapping choices"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isClientRole && form.type !== "choice" && form.type !== "end" ? (
          <div className="client-form-section">
            <div className="client-form-section-header">
              <div>
                <h3 className="form-title">Next step</h3>
                <p className="form-subtitle">
                  Use one direct next-step code for normal clinic flow progression.
                </p>
              </div>
            </div>

            <label className="form-field form-field-full">
              <span>Next step code</span>
              <input
                className="input-control"
                type="text"
                value={nextStepCode}
                onChange={(event) => setNextStepCode(event.target.value)}
                placeholder="Example: CHOOSE_REQUEST_TYPE"
              />
            </label>
          </div>
        ) : null}

        {isClientRole && form.type === "end" ? (
          <InlineAlert
            tone="info"
            message="End steps close the conversation and do not need a next step."
          />
        ) : null}

        {isClientRole ? (
          <div className="client-form-section client-form-section-compact">
            <div className="client-form-section-header">
              <div>
                <h3 className="form-title">Advanced routing</h3>
                <p className="form-subtitle">
                  Use this only when one next-step field or the choice builder is not enough.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setUseAdvancedTransitionEditor((previous) => !previous)}
              >
                {useAdvancedTransitionEditor ? "Hide advanced JSON" : "Open advanced JSON"}
              </button>
            </div>

            {advancedEditorNotice ? <InlineAlert tone="info" message={advancedEditorNotice} /> : null}

            {useAdvancedTransitionEditor ? (
              <label className="form-field form-field-full">
                <span>Advanced Transition JSON</span>
                <textarea
                  className="input-control text-area-control"
                  value={form.transitionConfigRaw}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, transitionConfigRaw: event.target.value }))
                  }
                  placeholder='Example: [{"when":"always","toStepCode":"END"}]'
                />
                <small className="form-help">
                  Enter a JSON array only if the simple builder cannot describe the routing you need.
                </small>
              </label>
            ) : null}
          </div>
        ) : null}

        {!isClientRole && form.type === "choice" ? (
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

        {!isClientRole ? (
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
              {
                'Enter a JSON array. Example: [{"when":{"operator":"eq","value":"en"},"nextStepCode":"NEXT"}]'
              }
            </small>
          </label>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting || isLoadingFlows}>
            {isSubmitting
              ? "Submitting..."
              : editingId
              ? isClientRole
                ? "Save Step Changes"
                : "Update Flow Step"
              : isClientRole
              ? "Create Step"
              : "Create Flow Step"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={() => resetEditor()}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {flowsErrorMessage ? <InlineAlert tone="error" message={flowsErrorMessage} /> : null}
      {submitError ? <InlineAlert tone="error" message={submitError} /> : null}
      {submitSuccess ? <InlineAlert tone="success" message={submitSuccess} /> : null}
      {isClientRole && clientMessagesError ? (
        <InlineAlert tone="error" message={clientMessagesError} />
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder={
          isClientRole
            ? "Search by step code, message key, saved field or routing..."
            : "Search by code, type, content key, flow id or transitions..."
        }
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
                {isClientRole ? getStepTypeLabel(type) : type}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading || (isClientRole && isLoadingClientMessages) ? (
        <LoadingState text={isClientRole ? "Loading scoped clinic flow..." : "Loading flow steps..."} />
      ) : null}

      {!isLoading && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      {!isLoading && !errorMessage && flowSteps.length === 0 ? (
        <InlineAlert tone="empty" message="No flow steps found." />
      ) : null}

      {!isLoading && !errorMessage && flowSteps.length > 0 && filteredFlowSteps.length === 0 ? (
        <InlineAlert tone="empty" message="No flow steps match the current filters." />
      ) : null}

      {!isLoading && !errorMessage && filteredFlowSteps.length > 0 && isClientRole ? (
        <>
          <div className="client-step-list">
            {paginatedFlowSteps.map((flowStep) => {
              const choiceState = choiceStateByStepId.get(flowStep._id) ?? {
                rows: [],
                requiresAdvanced: false,
              };
              const nextState =
                nextStepStateByStepId.get(flowStep._id) ?? deriveSimpleNextStep(flowStep.transitionConfig);
              const linkedMessage = linkedMessagePreview(flowStep.contentKey);
              const messagePreview = getFirstAvailableTranslation(linkedMessage ?? undefined);
              const dataKey =
                typeof flowStep.stepConfig?.dataKey === "string" ? flowStep.stepConfig.dataKey : "";
              const choiceSummary = getChoiceOptionSummary(choiceState.rows);

              return (
                <article
                  key={flowStep._id}
                  className={`client-step-card ${editingId === flowStep._id ? "client-step-card-active" : ""}`}
                >
                  <div className="client-step-card-header">
                    <div>
                      <p className="client-step-sequence">{`Step ${flowStep.sequence}`}</p>
                      <h3 className="client-step-title">{flowStep.code}</h3>
                      <p className="client-step-summary">
                        {buildClientStepSummary(flowStep, choiceState.rows, nextState)}
                      </p>
                    </div>

                    <div className="client-step-card-actions">
                      <span className="client-step-type-pill">{getStepTypeLabel(flowStep.type)}</span>
                      <StatusBadge value={flowStep.status} />
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(flowStep)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary-button button-danger table-action-button"
                        onClick={() => void handleDeleteStep(flowStep)}
                        disabled={isDeletingStepId === flowStep._id}
                      >
                        {isDeletingStepId === flowStep._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="client-step-detail-grid">
                    <div className="client-step-detail-card">
                      <span className="client-step-detail-label">Message key</span>
                      <strong>{flowStep.contentKey || "No message key linked yet"}</strong>
                      <p>
                        {flowStep.contentKey
                          ? messagePreview || "No visible text is configured yet. Save the text in Flow Messages."
                          : "This step does not currently point to a message template."}
                      </p>
                    </div>

                    <div className="client-step-detail-card">
                      <span className="client-step-detail-label">Stored field</span>
                      <strong>{dataKey || "No stored field"}</strong>
                      <p>
                        {dataKey
                          ? `Answers from this step are saved under ${dataKey}.`
                          : "This step does not store a field into the request data."}
                      </p>
                    </div>

                    <div className="client-step-detail-card">
                      <span className="client-step-detail-label">Routing</span>
                      <strong>
                        {flowStep.type === "choice"
                          ? choiceState.requiresAdvanced
                            ? "Advanced routing"
                            : `${choiceSummary.length} option${choiceSummary.length === 1 ? "" : "s"}`
                          : nextState.nextStepCode || (flowStep.type === "end" ? "Conversation ends" : "No direct next step")}
                      </strong>
                      <p>
                        {flowStep.type === "choice"
                          ? choiceState.requiresAdvanced
                            ? "This step contains advanced routing rules. Keep using the advanced editor when changing it."
                            : choiceSummary.length > 0
                            ? choiceSummary.join(" | ")
                            : "No choice routes are configured yet."
                          : nextState.requiresAdvanced
                          ? "This step uses advanced transition rules."
                          : nextState.nextStepCode
                          ? `Continues directly to ${nextState.nextStepCode}.`
                          : flowStep.type === "end"
                          ? "Stops the conversation here."
                          : "No direct next step is configured yet."}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
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

      {!isLoading && !errorMessage && filteredFlowSteps.length > 0 && !isClientRole ? (
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
                      <button
                        type="button"
                        className="secondary-button button-danger table-action-button"
                        onClick={() => void handleDeleteStep(flowStep)}
                        disabled={isDeletingStepId === flowStep._id}
                      >
                        {isDeletingStepId === flowStep._id ? "Deleting..." : "Delete"}
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
