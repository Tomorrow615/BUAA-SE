import type { ReactNode } from "react";

interface StatePanelProps {
  eyebrow?: string;
  title: string;
  description: string;
  tone?: "default" | "warning" | "danger";
  actions?: ReactNode;
}

export function StatePanel({
  eyebrow,
  title,
  description,
  tone = "default",
  actions,
}: StatePanelProps) {
  return (
    <section className={`section-card state-panel state-panel-${tone}`}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {actions ? <div className="button-row">{actions}</div> : null}
    </section>
  );
}
