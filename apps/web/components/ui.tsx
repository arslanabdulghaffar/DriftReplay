import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "teal" | "amber";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <Icon name="arrow" size={16} />
    </Link>
  );
}

export function CodeBlock({
  title,
  value,
  label,
}: {
  title: string;
  value: unknown;
  label?: string;
}) {
  return (
    <div className="code-block">
      <div className="code-header">
        <span>
          <Icon name="file" size={15} />
          {title}
        </span>
        {label && <span className="code-label">{label}</span>}
      </div>
      <pre tabIndex={0} aria-label={title}>
        <code>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</code>
      </pre>
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </div>
  );
}

export function ScopeNote() {
  return (
    <div className="scope-note">
      <span className="scope-dot" aria-hidden="true" />
      <p>
        <strong>Phase 1 · Foundation only.</strong> MercuryPay is a synthetic API fixture. Contract
        changes are curated examples. Runtime reproduction and patch verification have not run in
        this dashboard.
      </p>
    </div>
  );
}
