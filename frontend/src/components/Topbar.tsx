interface TopbarProps {
  title: string;
  description: string;
  section?: string;
}

function Topbar({ title, description, section }: TopbarProps) {
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
            Internal Console
          </div>
          <p className="topbar-meta-copy">Metadata-driven bot operations and runtime validation.</p>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
