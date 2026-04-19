interface TopbarProps {
  title: string;
  description: string;
}

function Topbar({ title, description }: TopbarProps) {
  return (
    <header className="topbar">
      <div>
        <h1 className="topbar-title">{title}</h1>
        <p className="topbar-description">{description}</p>
      </div>
    </header>
  );
}

export default Topbar;
