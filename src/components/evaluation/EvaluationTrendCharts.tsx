import type { EvaluationTrendPoint, OrphanTrendPoint } from "../../api/evaluation";
import { formatCount } from "../../lib/utils";

const WIDTH = 640;
const HEIGHT = 190;
const LEFT = 48;
const RIGHT = 16;
const TOP = 16;
const BOTTOM = 38;

const shortDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${value}T00:00:00Z`),
  );

const xAt = (index: number, total: number) =>
  LEFT + (index * (WIDTH - LEFT - RIGHT)) / Math.max(1, total - 1);

function AccessibleDataTable({
  id,
  caption,
  headers,
  rows,
}: {
  id: string;
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <table id={id} className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${id}-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td key={`${id}-${rowIndex}-${cellIndex}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-hairline px-4 py-4 sm:px-6">
        <h2 className="font-serif text-display-sm text-ink">{title}</h2>
        <p className="mt-1 text-caption leading-normal text-muted">{description}</p>
      </div>
      <div className="px-4 py-4 sm:px-6">{children}</div>
    </section>
  );
}

export function AcceptanceTrend({ points }: { points: EvaluationTrendPoint[] }) {
  const plotted = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.acceptance_rate !== null);
  const polyline = plotted
    .map(({ point, index }) => {
      const x = xAt(index, points.length);
      const y = TOP + (1 - point.acceptance_rate!) * (HEIGHT - TOP - BOTTOM);
      return `${x},${y}`;
    })
    .join(" ");
  const reviewed = points.reduce((sum, point) => sum + point.accepted + point.rejected, 0);
  const dataRows = points.map((point) => [
    shortDate(point.bucket_start),
    point.acceptance_rate === null
      ? "Not available"
      : `${Math.round(point.acceptance_rate * 100)}%`,
    formatCount(point.accepted),
    formatCount(point.rejected),
  ]);

  return (
    <ChartFrame
      title="Acceptance trend"
      description="Acceptance rate for each generated-suggestion cohort in the selected period."
    >
      {plotted.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted">
          No reviewed suggestions in this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="min-w-[620px]"
            role="img"
            aria-label="Acceptance rate over time"
            aria-describedby="acceptance-trend-data"
          >
            {[0, 0.5, 1].map((rate) => {
              const y = TOP + (1 - rate) * (HEIGHT - TOP - BOTTOM);
              return (
                <g key={rate}>
                  <line
                    x1={LEFT}
                    x2={WIDTH - RIGHT}
                    y1={y}
                    y2={y}
                    className="stroke-hairline"
                  />
                  <text x={0} y={y + 4} className="fill-muted text-caption-sm">
                    {Math.round(rate * 100)}%
                  </text>
                </g>
              );
            })}
            {plotted.length > 1 && (
              <polyline
                points={polyline}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="text-primary"
              />
            )}
            {plotted.map(({ point, index }) => {
              const x = xAt(index, points.length);
              const y = TOP + (1 - point.acceptance_rate!) * (HEIGHT - TOP - BOTTOM);
              return (
                <circle key={point.bucket_start} cx={x} cy={y} r="5" className="fill-primary">
                  <title>
                    {shortDate(point.bucket_start)}: {Math.round(point.acceptance_rate! * 100)}% · {point.accepted} accepted · {point.rejected} rejected
                  </title>
                </circle>
              );
            })}
            {[0, Math.floor((points.length - 1) / 2), points.length - 1]
              .filter((value, index, values) => values.indexOf(value) === index)
              .map((index) => (
                <text
                  key={index}
                  x={xAt(index, points.length)}
                  y={HEIGHT - 10}
                  textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                  className="fill-muted text-caption-sm"
                >
                  {shortDate(points[index].bucket_start)}
                </text>
              ))}
          </svg>
          <p className="mt-1 text-caption-sm text-muted">
            {formatCount(reviewed)} reviewed suggestions across {formatCount(points.length)} time buckets.
          </p>
          <AccessibleDataTable
            id="acceptance-trend-data"
            caption="Acceptance rate data over time"
            headers={["Date", "Acceptance rate", "Accepted", "Rejected"]}
            rows={dataRows}
          />
        </div>
      )}
    </ChartFrame>
  );
}

export function OrphanTrend({ points }: { points: OrphanTrendPoint[] }) {
  if (points.length < 2) {
    return (
      <ChartFrame
        title="Orphan-page trend"
        description="Daily snapshots start when this dashboard feature is deployed."
      >
        <div className="py-8 text-center text-body-sm text-muted">
          {points.length === 1 ? (
            <>
              First snapshot recorded: {formatCount(points[0].remaining)} orphan pages on {shortDate(points[0].snapshot_date)}.
            </>
          ) : (
            "The first daily snapshot has not been recorded yet."
          )}
        </div>
      </ChartFrame>
    );
  }

  const values = points.map((point) => point.remaining);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const polyline = points
    .map((point, index) => {
      const x = xAt(index, points.length);
      const y = TOP + ((max - point.remaining) / range) * (HEIGHT - TOP - BOTTOM);
      return `${x},${y}`;
    })
    .join(" ");
  const dataRows = points.map((point) => [
    shortDate(point.snapshot_date),
    formatCount(point.remaining),
    formatCount(point.active_articles),
  ]);

  return (
    <ChartFrame
      title="Orphan-page trend"
      description="Daily count of active pages with no observed inbound internal link."
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="min-w-[620px]"
          role="img"
          aria-label="Orphan pages remaining over time"
          aria-describedby="orphan-trend-data"
        >
          <line
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={HEIGHT - BOTTOM}
            y2={HEIGHT - BOTTOM}
            className="stroke-hairline"
          />
          <polyline
            points={polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-primary"
          />
          {points.map((point, index) => {
            const x = xAt(index, points.length);
            const y = TOP + ((max - point.remaining) / range) * (HEIGHT - TOP - BOTTOM);
            return (
              <circle key={point.snapshot_date} cx={x} cy={y} r="5" className="fill-primary">
                <title>
                  {shortDate(point.snapshot_date)}: {point.remaining} orphan pages of {point.active_articles} active articles
                </title>
              </circle>
            );
          })}
          <text x={0} y={TOP + 4} className="fill-muted text-caption-sm">
            {formatCount(max)}
          </text>
          <text x={0} y={HEIGHT - BOTTOM + 4} className="fill-muted text-caption-sm">
            {formatCount(min)}
          </text>
          <text x={LEFT} y={HEIGHT - 10} className="fill-muted text-caption-sm">
            {shortDate(points[0].snapshot_date)}
          </text>
          <text
            x={WIDTH - RIGHT}
            y={HEIGHT - 10}
            textAnchor="end"
            className="fill-muted text-caption-sm"
          >
            {shortDate(points[points.length - 1].snapshot_date)}
          </text>
        </svg>
        <AccessibleDataTable
          id="orphan-trend-data"
          caption="Orphan pages remaining over time"
          headers={["Date", "Orphan pages remaining", "Active articles"]}
          rows={dataRows}
        />
      </div>
    </ChartFrame>
  );
}
