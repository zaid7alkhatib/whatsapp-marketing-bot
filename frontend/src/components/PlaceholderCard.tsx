interface PlaceholderCardProps {
  title: string;
  description: string;
}

function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <p className="card-description">{description}</p>
      <p className="card-muted">Coming next</p>
    </section>
  );
}

export default PlaceholderCard;
