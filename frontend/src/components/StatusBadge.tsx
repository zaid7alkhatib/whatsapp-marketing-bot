import { useClientLocale } from "../i18n/ClientLocaleContext";

interface StatusBadgeProps {
  value: string;
}

function StatusBadge({ value }: StatusBadgeProps) {
  const { t } = useClientLocale();
  const normalizedValue = value.trim().toLowerCase();
  const normalizedTranslationKey = normalizedValue.replace(/\s+/g, "_");
  const translationKey = `status.${normalizedTranslationKey}`;
  const translatedValue = t(translationKey);
  const label = translatedValue === translationKey ? value : translatedValue;
  let toneClass = "status-neutral";

  if (["active", "online", "published", "completed", "connected", "sent", "acknowledged"].includes(normalizedValue)) {
    toneClass = "status-positive";
  } else if (["inactive", "archived", "cancelled", "rejected", "failed", "disconnected", "ack_failed"].includes(normalizedValue)) {
    toneClass = "status-negative";
  } else if (["draft", "pending", "paused", "queued", "sending", "connecting", "new", "ready"].includes(normalizedValue)) {
    toneClass = "status-warning";
  }

  return <span className={`status-badge ${toneClass}`}>{label}</span>;
}

export default StatusBadge;
