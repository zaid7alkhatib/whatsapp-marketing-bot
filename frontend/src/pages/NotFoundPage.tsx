import { Link } from "react-router-dom";
import { useClientLocale } from "../i18n/ClientLocaleContext";

function NotFoundPage() {
  const { t } = useClientLocale();

  return (
    <section className="data-card page-section-card">
      <div className="section-header">
        <div className="section-copy">
          <h2 className="card-title">{t("notFound.title")}</h2>
          <p className="card-description">{t("notFound.description")}</p>
        </div>
        <Link className="secondary-button" to="/dashboard">
          {t("notFound.back")}
        </Link>
      </div>
    </section>
  );
}

export default NotFoundPage;
