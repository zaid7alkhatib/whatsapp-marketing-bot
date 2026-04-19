interface StatusBadgeProps {
  value: string;
}

function StatusBadge({ value }: StatusBadgeProps) {
  const normalizedValue = value.trim().toLowerCase();
  let toneClass = "status-neutral";

  if (["active", "online", "published", "completed"].includes(normalizedValue)) {
    toneClass = "status-positive";
  } else if (["inactive", "archived", "cancelled", "rejected"].includes(normalizedValue)) {
    toneClass = "status-negative";
  } else if (["draft", "pending", "paused"].includes(normalizedValue)) {
    toneClass = "status-warning";
  }

  return <span className={`status-badge ${toneClass}`}>{value}</span>;
}

export default StatusBadge;
