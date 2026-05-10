import type { ReactNode } from "react";
import { useClientLocale } from "../i18n/ClientLocaleContext";

interface PageSectionProps {
  title: string;
  description?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

function PageSection({ title, description, onRefresh, actions, children }: PageSectionProps) {
  const { t } = useClientLocale();

  return (
    <section className="data-card page-section-card">
      <div className="section-header">
        <div className="section-copy">
          <h2 className="card-title">{title}</h2>
          {description ? <p className="card-description">{description}</p> : null}
        </div>
        <div className="section-actions">
          {actions}
          {onRefresh ? (
            <button type="button" className="secondary-button section-refresh" onClick={onRefresh}>
              {t("common.refresh")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}

export default PageSection;
