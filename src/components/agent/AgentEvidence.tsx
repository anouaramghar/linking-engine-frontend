import { metricEntries, summaryFor, toolHrefFor, toolLabelFor } from "./agentPresentation";

interface ToolTraceProps {
  name: string;
  outcome: Record<string, unknown>;
  currentHref: string;
}

export function ToolTrace({ name, outcome, currentHref }: ToolTraceProps) {
  const metrics = metricEntries(outcome);
  const href = toolHrefFor(name, outcome, currentHref);

  return (
    <details className="assistant-tool-disclosure">
      <summary>
        <span className="assistant-tool-disclosure__mark" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2.5 6.2 2.1 2.1 4.9-5" />
          </svg>
        </span>
        <span className="assistant-tool-disclosure__label">{toolLabelFor(name)}</span>
        <span className="assistant-tool-disclosure__summary">{summaryFor(name, metrics)}</span>
        <span className="assistant-tool-disclosure__toggle" aria-hidden="true" />
      </summary>
      <div className="assistant-tool-disclosure__body">
        {/* Keep the exact registry name available for debugging and assistive
            inspection without making implementation vocabulary the primary UI. */}
        <span className="sr-only">{name}</span>
        {metrics.length > 0 && (
          <dl className="assistant-tool-metrics">
            {metrics.map(({ key, label, value }) => (
              <div key={key} className="assistant-tool-metric">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {href && (
          <a className="assistant-tool-link" href={href}>
            {toolLabelFor(name) === "Review queue" ? "Open review queue" : `Open ${toolLabelFor(name).toLowerCase()}`}
          </a>
        )}
      </div>
    </details>
  );
}
