"use client";

type StateVariant = "inline" | "card";

type StateProps = {
  title?: string;
  message: string;
  variant?: StateVariant;
};

type ErrorStateProps = StateProps & {
  onRetry?: () => void;
  retryLabel?: string;
};

function StateContainer({
  variant = "inline",
  children
}: {
  variant?: StateVariant;
  children: React.ReactNode;
}) {
  if (variant === "card") {
    return <div className="card">{children}</div>;
  }

  return <>{children}</>;
}

export function LoadingState({
  title,
  message,
  variant = "inline"
}: StateProps) {
  return (
    <StateContainer variant={variant}>
      {title ? <h2>{title}</h2> : null}
      <p>{message}</p>
    </StateContainer>
  );
}

export function EmptyState({
  title,
  message,
  variant = "inline"
}: StateProps) {
  return (
    <StateContainer variant={variant}>
      {title ? <h2>{title}</h2> : null}
      <p className="muted">{message}</p>
    </StateContainer>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  variant = "inline"
}: ErrorStateProps) {
  return (
    <StateContainer variant={variant}>
      {title ? <h2>{title}</h2> : null}
      <p className="error">{message}</p>
      {onRetry ? (
        <button type="button" className="secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </StateContainer>
  );
}
