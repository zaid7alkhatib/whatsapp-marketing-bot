interface InlineAlertProps {
  tone?: "error" | "success" | "empty" | "info";
  message: string;
}

const TONE_CLASS_MAP: Record<NonNullable<InlineAlertProps["tone"]>, string> = {
  error: "state-error",
  success: "state-success",
  empty: "state-empty",
  info: "state-info",
};

function InlineAlert({ tone = "info", message }: InlineAlertProps) {
  return (
    <div className={`state-block ${TONE_CLASS_MAP[tone]}`}>
      <p>{message}</p>
    </div>
  );
}

export default InlineAlert;
