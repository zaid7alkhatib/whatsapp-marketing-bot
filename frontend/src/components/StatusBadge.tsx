import { useClientLocale } from "../i18n/ClientLocaleContext";

interface StatusBadgeProps {
  value: string;
}

function StatusBadge({ value }: StatusBadgeProps) {
  const { t } = useClientLocale();
  const normalizedValue = value.trim().toLowerCase();
  const translationKey = `status.${normalizedValue}`;
  const translatedValue = t(translationKey);
  const label = translatedValue === translationKey ? value : translatedValue;
  let toneClass = "status-neutral";

  if (["active", "online", "published", "completed"].includes(normalizedValue)) {
    toneClass = "status-positive";
  } else if (["inactive", "archived", "cancelled", "rejected"].includes(normalizedValue)) {
    toneClass = "status-negative";
  } else if (["draft", "pending", "paused"].includes(normalizedValue)) {
    toneClass = "status-warning";
  }

  return <span className={`status-badge ${toneClass}`}>{label}</span>;
}

export default StatusBadge;
