import type { ReactNode } from "react";

interface PageSectionProps {
  title: string;
  description?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

function PageSection({ title, description, onRefresh, actions, children }: PageSectionProps) {
  return (
    <section className="data-card">
      <div className="section-header">
        <div>
          <h2 className="card-title">{title}</h2>
          {description ? <p className="card-description">{description}</p> : null}
        </div>
        <div className="section-actions">
          {actions}
          {onRefresh ? (
            <button type="button" className="secondary-button section-refresh" onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
        </div>
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}

export default PageSection;
