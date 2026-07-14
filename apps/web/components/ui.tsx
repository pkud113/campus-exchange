import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={["page-header", className].filter(Boolean).join(" ")}>
      <div className="page-header-copy">
        {eyebrow && <span className="overline">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {meta && <div className="page-header-meta">{meta}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="section-header">
      <div>
        {eyebrow && <span className="overline">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-header-action">{action}</div>}
    </header>
  );
}

export function SurfaceCard({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={["surface-card", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  return (
    <span
      className={["ui-badge", `ui-badge-${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      {icon}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={["skeleton", className].filter(Boolean).join(" ")} />;
}

export function PageSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <main className="dashboard page-skeleton" aria-busy="true" aria-label="Loading page">
      <div className="skeleton-header">
        <Skeleton className="skeleton-kicker" />
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-copy" />
      </div>
      <div className="skeleton-stats">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton-stat" key={index} />
        ))}
      </div>
      <div className="skeleton-grid">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton className="skeleton-card" key={index} />
        ))}
      </div>
    </main>
  );
}
