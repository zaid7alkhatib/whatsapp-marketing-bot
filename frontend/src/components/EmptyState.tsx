interface EmptyStateProps {
  title: string;
  description?: string;
}

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="state-block state-empty">
      <p>
        <strong>{title}</strong>
      </p>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export default EmptyState;
