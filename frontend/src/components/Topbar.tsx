import { useAuth } from "../auth/AuthContext";

interface TopbarProps {
  title: string;
  description: string;
  section?: string;
}

function Topbar({ title, description, section }: TopbarProps) {
  const { user, logout } = useAuth();

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
            {user?.role === "user" ? "Client Workspace" : "Internal Console"}
          </div>
          <div className="topbar-meta-actions">
            <p className="topbar-meta-copy">
              {user
                ? `${user.username} | ${user.role}`
                : "Metadata-driven bot operations and runtime validation."}
            </p>
            <button
              type="button"
              className="secondary-button topbar-logout"
              onClick={() => void logout()}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
