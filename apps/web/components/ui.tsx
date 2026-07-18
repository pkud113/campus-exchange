import * as React from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import Link from "next/link";
import { Search } from "lucide-react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export function Button({
  variant = "primary",
  size = "medium",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  busy?: boolean;
}) {
  return (
    <button
      className={classes("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner label="Working" size="small" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "medium",
  className,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  className?: string;
  children: ReactNode;
}) {
  return <Link href={href} className={classes("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}>{children}</Link>;
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={classes("ui-icon-button", className)} aria-label={label} title={label} {...props}>{children}</button>;
}

export function PageHeader({ eyebrow, title, description, actions, meta, className = "" }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; className?: string;
}) {
  return (
    <header className={classes("page-header", className)}>
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

export function SectionHeader({ eyebrow, title, description, action }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <header className="section-header">
      <div>{eyebrow && <span className="overline">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>
      {action && <div className="section-header-action">{action}</div>}
    </header>
  );
}

export function SurfaceCard({ children, className = "", id, as = "div" }: {
  children: ReactNode; className?: string; id?: string; as?: "div" | "article" | "section";
}) {
  const Component = as;
  return <Component id={id} className={classes("surface-card", className)}>{children}</Component>;
}

export function EntityCard({ href, media, eyebrow, title, description, meta, actions, className }: {
  href?: string; media?: ReactNode; eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string;
}) {
  const content = <>{media && <div className="entity-card-media">{media}</div>}<div className="entity-card-body">{eyebrow && <div className="entity-card-eyebrow">{eyebrow}</div>}<h3>{title}</h3>{description && <p>{description}</p>}{meta && <div className="entity-card-meta">{meta}</div>}</div></>;
  return <article className={classes("surface-card", "entity-card", className)}>{href ? <Link className="entity-card-link" href={href}>{content}</Link> : content}{actions && <div className="entity-card-actions">{actions}</div>}</article>;
}

export const UserCard = EntityCard;
export const ListingCard = EntityCard;
export const EventCard = EntityCard;
export const PostCard = EntityCard;
export const OrganizationCard = EntityCard;
export const CommunityCard = EntityCard;

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={classes("ui-badge", `ui-badge-${tone}`, className)}>{children}</span>;
}

export function StatusIndicator({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={classes("ui-status", `ui-status-${tone}`)}><span aria-hidden="true" />{label}</span>;
}

export function FormField({ label, htmlFor, hint, error, required, children, className }: {
  label: ReactNode; htmlFor: string; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string;
}) {
  return <div className={classes("ui-field", Boolean(error) && "ui-field-invalid", className)}><label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{hint && !error && <p className="ui-field-hint" id={`${htmlFor}-hint`}>{hint}</p>}{error && <p className="ui-field-error" id={`${htmlFor}-error`} role="alert">{error}</p>}</div>;
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={classes("ui-input", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function TextArea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={classes("ui-input", "ui-textarea", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Select({ className, invalid, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={classes("ui-input", "ui-select", className)} aria-invalid={invalid || undefined} {...props}>{children}</select>;
}

export function SearchControl({ action, name = "q", label = "Search", defaultValue, placeholder = "Search", className }: { action: string; name?: string; label?: string; defaultValue?: string; placeholder?: string; className?: string }) {
  return <form className={classes("ui-search", className)} action={action} role="search"><Search aria-hidden="true" /><label className="sr-only" htmlFor={`search-${name}`}>{label}</label><input id={`search-${name}`} name={name} type="search" defaultValue={defaultValue} placeholder={placeholder} /><button type="submit">{label}</button></form>;
}

export function Checkbox({ label, description, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  return <label className={classes("ui-choice", className)}><input type="checkbox" {...props} /><span className="ui-choice-control" aria-hidden="true" /><span><strong>{label}</strong>{description && <small>{description}</small>}</span></label>;
}

export function Radio({ label, description, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  return <label className={classes("ui-choice", "ui-radio", className)}><input type="radio" {...props} /><span className="ui-choice-control" aria-hidden="true" /><span><strong>{label}</strong>{description && <small>{description}</small>}</span></label>;
}

export function Switch({ label, description, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & { label: ReactNode; description?: ReactNode }) {
  return <label className={classes("ui-switch", className)}><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" role="switch" {...props} /><span className="ui-switch-track" aria-hidden="true"><span /></span></label>;
}

export function Alert({ title, children, tone = "neutral", action, className }: { title?: ReactNode; children: ReactNode; tone?: Tone; action?: ReactNode; className?: string }) {
  return <div className={classes("ui-alert", `ui-alert-${tone}`, className)} role={tone === "danger" ? "alert" : "status"}><div>{title && <strong>{title}</strong>}<div>{children}</div></div>{action && <div className="ui-alert-action">{action}</div>}</div>;
}

export function EmptyState({ icon, title, description, action, compact = false }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return <div className={classes("empty-state", compact && "compact")}>{icon}<h2>{title}</h2>{description && <p>{description}</p>}{action && <div className="empty-state-action">{action}</div>}</div>;
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="error-state" role="alert"><div className="error-state-mark" aria-hidden="true">!</div><h2>{title}</h2>{description && <p>{description}</p>}{action && <div>{action}</div>}</div>;
}

export function Spinner({ label = "Loading", size = "medium" }: { label?: string; size?: "small" | "medium" | "large" }) {
  return <span className={classes("ui-spinner", `ui-spinner-${size}`)} role="status"><span aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

export function InfiniteLoading({ label = "Loading more" }: { label?: string }) {
  return <div className="infinite-loading" role="status"><Spinner label={label} /><span>{label}</span></div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={classes("skeleton", className)} aria-hidden="true" />;
}

export function PageSkeleton({ cards = 8 }: { cards?: number }) {
  return <main className="dashboard page-skeleton" aria-busy="true" aria-label="Loading page"><div className="skeleton-header"><Skeleton className="skeleton-kicker" /><Skeleton className="skeleton-title" /><Skeleton className="skeleton-copy" /></div><div className="skeleton-stats">{Array.from({ length: 4 }, (_, index) => <Skeleton className="skeleton-stat" key={index} />)}</div><div className="skeleton-grid">{Array.from({ length: cards }, (_, index) => <Skeleton className="skeleton-card" key={index} />)}</div></main>;
}

export function Pagination({ currentPage, totalPages, hrefForPage, label = "Pagination" }: { currentPage: number; totalPages: number; hrefForPage: (page: number) => string; label?: string }) {
  if (totalPages <= 1) return null;
  const pages = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages].filter((page) => page >= 1 && page <= totalPages))).sort((a, b) => a - b);
  return <nav className="ui-pagination" aria-label={label}>{currentPage > 1 && <Link href={hrefForPage(currentPage - 1)} rel="prev">Previous</Link>}{pages.map((page, index) => <span key={page}>{index > 0 && page - pages[index - 1]! > 1 && <span aria-hidden="true">…</span>}<Link href={hrefForPage(page)} aria-current={page === currentPage ? "page" : undefined}>{page}</Link></span>)}{currentPage < totalPages && <Link href={hrefForPage(currentPage + 1)} rel="next">Next</Link>}</nav>;
}

export function ImageGallery({ images, label = "Image gallery" }: { images: Array<{ src: string; alt: string }>; label?: string }) {
  if (!images.length) return null;
  return <div className={classes("ui-gallery", images.length === 1 && "ui-gallery-single")} aria-label={label}>{images.slice(0, 5).map((image, index) => <figure key={`${image.src}-${index}`}><img src={image.src} alt={image.alt} loading={index ? "lazy" : "eager"} />{index === 4 && images.length > 5 && <figcaption>+{images.length - 5} more</figcaption>}</figure>)}</div>;
}
