interface JsonBlockProps {
  title: string;
  value: unknown;
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) {
    return "{}";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JsonBlock({ title, value }: JsonBlockProps) {
  return (
    <div className="result-block">
      <h3 className="result-title">{title}</h3>
      <pre className="json-output">{formatJson(value)}</pre>
    </div>
  );
}

export default JsonBlock;
