import { useId, type ReactNode } from "react";

export interface Point { label: string; value: number; }
export interface Series { name: string; points: Point[]; color?: string; }

const SERIES_VARS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/** Screen-reader equivalent for every chart: the same numbers as a table. */
function DataTableFallback({ caption, series, format }: { caption: string; series: Series[]; format: (value: number) => string }) {
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  return (
    <table className="ds-sr-only">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Period</th>{series.map((item, si) => <th key={`${item.name}-${si}`} scope="col">{item.name}</th>)}</tr></thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={`${label}-${index}`}><th scope="row">{label}</th>{series.map((item, si) => <td key={`${item.name}-${si}`}>{format(item.points[index]?.value ?? 0)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarChart({
  series, title, height = 200, format = (value) => String(value), stacked, footer,
}: { series: Series[]; title: string; height?: number; format?: (value: number) => string; stacked?: boolean; footer?: ReactNode }) {
  const id = useId();
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const max = niceMax(stacked
    ? Math.max(1, ...labels.map((_, index) => series.reduce((sum, item) => sum + (item.points[index]?.value ?? 0), 0)))
    : Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value))));
  const width = 600;
  const padL = 56; const padB = 26; const padT = 8;
  const plotW = width - padL - 8; const plotH = height - padB - padT;
  const slot = plotW / Math.max(1, labels.length);
  const barW = stacked ? Math.min(34, slot * 0.6) : Math.min(22, (slot * 0.68) / series.length);

  return (
    <figure style={{ margin: 0 }}>
      <svg className="ds-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t`} preserveAspectRatio="none" style={{ height }}>
        <title id={`${id}-t`}>{title}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line className="ds-gridline" x1={padL} x2={width - 8} y1={padT + plotH * ratio} y2={padT + plotH * ratio} />
            <text className="ds-axis" x={padL - 8} y={padT + plotH * ratio + 4} textAnchor="end">{format(max * (1 - ratio))}</text>
          </g>
        ))}
        {labels.map((label, index) => {
          let stackY = padT + plotH;
          return (
            <g key={`${label}-${index}`}>
              {series.map((item, si) => {
                const value = item.points[index]?.value ?? 0;
                const h = Math.max(0, (value / max) * plotH);
                const x = stacked
                  ? padL + slot * index + slot / 2 - barW / 2
                  : padL + slot * index + slot / 2 - (barW * series.length) / 2 + barW * si;
                const y = stacked ? (stackY -= h) : padT + plotH - h;
                return <rect key={`${item.name}-${si}`} x={x} y={y} width={barW} height={h} rx={3} fill={item.color ?? SERIES_VARS[si % SERIES_VARS.length]} />;
              })}
              <text className="ds-axis" x={padL + slot * index + slot / 2} y={height - 8} textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
      <DataTableFallback caption={title} series={series} format={format} />
      {series.length > 1 && (
        <div className="ds-chart-legend">
          {series.map((item, index) => (
            <span key={`${item.name}-${index}`}><i className="ds-swatch" style={{ background: item.color ?? SERIES_VARS[index % SERIES_VARS.length] }} />{item.name}</span>
          ))}
        </div>
      )}
      {footer && <figcaption className="ds-subtle" style={{ marginTop: 8 }}>{footer}</figcaption>}
    </figure>
  );
}

export function LineChart({
  series, title, height = 200, format = (value) => String(value), footer,
}: { series: Series[]; title: string; height?: number; format?: (value: number) => string; footer?: ReactNode }) {
  const id = useId();
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value))));
  const width = 600; const padL = 56; const padB = 26; const padT = 8;
  const plotW = width - padL - 8; const plotH = height - padB - padT;
  const step = plotW / Math.max(1, labels.length - 1);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="ds-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t`} style={{ height }}>
        <title id={`${id}-t`}>{title}</title>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line className="ds-gridline" x1={padL} x2={width - 8} y1={padT + plotH * ratio} y2={padT + plotH * ratio} />
            <text className="ds-axis" x={padL - 8} y={padT + plotH * ratio + 4} textAnchor="end">{format(max * (1 - ratio))}</text>
          </g>
        ))}
        {series.map((item, si) => {
          const color = item.color ?? SERIES_VARS[si % SERIES_VARS.length];
          const d = item.points.map((point, index) => `${index === 0 ? "M" : "L"} ${padL + step * index} ${padT + plotH - (point.value / max) * plotH}`).join(" ");
          return (
            <g key={`${item.name}-${si}`}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {item.points.map((point, index) => (
                <circle key={`${point.label}-${index}`} cx={padL + step * index} cy={padT + plotH - (point.value / max) * plotH} r={3} fill={color}>
                  <title>{`${item.name} · ${point.label} · ${format(point.value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labels.map((label, index) => (
          <text key={`${label}-${index}`} className="ds-axis" x={padL + step * index} y={height - 8} textAnchor="middle">{label}</text>
        ))}
      </svg>
      <DataTableFallback caption={title} series={series} format={format} />
      {series.length > 1 && (
        <div className="ds-chart-legend">
          {series.map((item, index) => (
            <span key={`${item.name}-${index}`}><i className="ds-swatch" style={{ background: item.color ?? SERIES_VARS[index % SERIES_VARS.length] }} />{item.name}</span>
          ))}
        </div>
      )}
      {footer && <figcaption className="ds-subtle" style={{ marginTop: 8 }}>{footer}</figcaption>}
    </figure>
  );
}

export function DonutChart({ points, title, format = (value) => String(value), size = 160 }: { points: Point[]; title: string; format?: (value: number) => string; size?: number }) {
  const id = useId();
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <figure style={{ margin: 0, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{title}</title>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {points.map((point, index) => {
            const fraction = total === 0 ? 0 : point.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={`${point.label}-${index}`}
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={SERIES_VARS[index % SERIES_VARS.length]} strokeWidth={18}
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset}
              ><title>{`${point.label}: ${format(point.value)}`}</title></circle>
            );
            offset += dash;
            return element;
          })}
        </g>
      </svg>
      <div className="ds-stack ds-gap-2">
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`} className="ds-row ds-gap-2" style={{ fontSize: "var(--text-sm)" }}>
            <i className="ds-swatch" style={{ background: SERIES_VARS[index % SERIES_VARS.length] }} />
            <span className="ds-grow">{point.label}</span>
            <strong className="ds-num">{format(point.value)}</strong>
          </span>
        ))}
      </div>
    </figure>
  );
}

export function Sparkline({ values, color = "var(--series-1)", height = 28, label }: { values: number[]; color?: string; height?: number; label: string }) {
  if (values.length < 2) return <span className="ds-subtle">—</span>;
  const max = Math.max(...values); const min = Math.min(...values);
  const span = max - min || 1;
  const width = 90;
  const d = values.map((value, index) => `${index === 0 ? "M" : "L"} ${(index / (values.length - 1)) * width} ${height - ((value - min) / span) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label={label} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
