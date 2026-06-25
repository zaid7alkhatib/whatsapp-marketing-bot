import { useAuth } from "../auth/AuthContext";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import CursorPicker from "./CursorPicker";
import LanguageToggle from "./LanguageToggle";

interface TopbarProps {
  title: string;
  description: string;
  section?: string;
}

function Topbar({ title, description, section }: TopbarProps) {
  const { user, logout } = useAuth();
  const { isClientUser, t } = useClientLocale();
  const roleLabel = user?.role.replace("_", " ") ?? "";

  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="topbar-copy">
          {section ? <p className="topbar-kicker">{section}</p> : null}
          <h1 className="topbar-title">{title}</h1>
          <p className="topbar-description">{description}</p>
        </div>

        <div className="topbar-meta">
          <div className="topbar-tools">
            <CursorPicker />
            <LanguageToggle />
          </div>
          <div className="topbar-user-card">
            <div className="topbar-chip">
              <span className="topbar-chip-dot" />
              {isClientUser ? t("topbar.clientChip") : t("topbar.adminChip")}
            </div>
            <div className="topbar-user-copy">
              <strong>{user?.displayName ?? user?.username ?? t("topbar.metaFallback")}</strong>
              {user ? <span>{roleLabel}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="icon-button topbar-logout"
            onClick={() => void logout()}
            aria-label={t("topbar.logout")}
            title={t("topbar.logout")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="icon-button-svg">
              <path d="M10 4H6.5C5.1 4 4 5.1 4 6.5v11C4 18.9 5.1 20 6.5 20H10" />
              <path d="M14 7l5 5-5 5" />
              <path d="M19 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
