interface LoadingStateProps {
  text?: string;
}

function LoadingState({ text = "Loading..." }: LoadingStateProps) {
  return <p className="state-text state-loading">{text}</p>;
}

export default LoadingState;
