import { useAuth } from "../auth/AuthContext";
import { useClientLocale } from "../i18n/ClientLocaleContext";

interface TopbarProps {
  title: string;
  description: string;
  section?: string;
}

function Topbar({ title, description, section }: TopbarProps) {
  const { user, logout } = useAuth();
  const { isClientUser, language, setLanguage, t } = useClientLocale();

  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="topbar-copy">
          {section ? <p className="topbar-kicker">{section}</p> : null}
          <h1 className="topbar-title">{title}</h1>
          <p className="topbar-description">{description}</p>
        </div>

        <div className="topbar-meta">
          <div className="topbar-chip">
            <span className="topbar-chip-dot" />
            {isClientUser ? t("topbar.clientChip") : t("topbar.adminChip")}
          </div>
          <div className="topbar-meta-actions">
            {isClientUser ? (
              <label className="topbar-language">
                <span className="topbar-language-label">
                  <span className="topbar-language-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        d="M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 0 0 0-19m6.79 8h-3.16a15.5 15.5 0 0 0-1.65-5.1a8.03 8.03 0 0 1 4.81 5.1m-6.79 9a13.66 13.66 0 0 1-2.02-4.5h4.04A13.66 13.66 0 0 1 12 19.5m-2.43-6.5A13.8 13.8 0 0 1 9.5 12c0-.51.03-1.01.07-1.5h4.86c.04.49.07.99.07 1.5s-.03 1.01-.07 1.5zM5.21 13.5a8.7 8.7 0 0 1 0-3h3.02c-.03.5-.05 1-.05 1.5s.02 1 .05 1.5zm1 1.5h3.16a15.5 15.5 0 0 0 1.65 5.1a8.03 8.03 0 0 1-4.81-5.1M12 4.5a13.66 13.66 0 0 1 2.02 4.5H9.98A13.66 13.66 0 0 1 12 4.5m.98.9a8.03 8.03 0 0 1 4.81 5.1h-3.16a15.5 15.5 0 0 0-1.65-5.1M15.78 13.5c.03-.5.05-1 .05-1.5s-.02-1-.05-1.5h3.02a8.7 8.7 0 0 1 0 3zm-1.15 1.5h3.16a8.03 8.03 0 0 1-4.81 5.1a15.5 15.5 0 0 0 1.65-5.1"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>{t("language.label")}</span>
                </span>
                <select
                  className="topbar-language-select"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as typeof language)}
                >
                  <option value="en">{t("language.english")}</option>
                  <option value="ar">{t("language.arabic")}</option>
                  <option value="de">{t("language.german")}</option>
                </select>
              </label>
            ) : null}
            <p className="topbar-meta-copy">
              {user
                ? `${user.username} | ${user.role}`
                : t("topbar.metaFallback")}
            </p>
            <button
              type="button"
              className="secondary-button topbar-logout"
              onClick={() => void logout()}
            >
              {t("topbar.logout")}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
