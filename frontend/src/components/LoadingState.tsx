import { useClientLocale } from "../i18n/ClientLocaleContext";

interface LoadingStateProps {
  text?: string;
}

function LoadingState({ text }: LoadingStateProps) {
  const { t } = useClientLocale();

  return <p className="state-text state-loading">{text ?? t("common.loading")}</p>;
}

export default LoadingState;
