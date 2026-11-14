import type { PricePoint } from "@/entities/market";

// The price chart as SVG paths in a 1000 × 1000 box (drawn with preserveAspectRatio="none" and non-scaling strokes),
// plus "nice" gridline values. Values are numbers here because they only become pixels.

export const CHART_SIZE = 1000;

export type Domain = { min: number; max: number };

export type ChartGeometry = {
  line: string;
  area: string;
  /** Last point as percentages of the box, for the dot and the "now" tag. */
  last: { x: number; y: number } | null;
  /** y of a value as a percentage of the box height. */
  yPercent: (value: number) => number;
};

/** Points spread by time across the box; a single point becomes a flat line, an empty series draws nothing. */
export function chartGeometry(values: readonly { t: number; v: number }[], domain: Domain): ChartGeometry {
  const span = domain.max - domain.min;
  const yPercent = (v: number) => (span === 0 ? 50 : ((domain.max - v) / span) * 100);
  if (values.length === 0) return { line: "", area: "", last: null, yPercent };
  const t0 = values[0].t;
  const t1 = values.at(-1)!.t;
  const xPercent = (t: number) => (t1 === t0 ? 100 : ((t - t0) / (t1 - t0)) * 100);
  const pts = values.map((p) => ({ x: xPercent(p.t), y: yPercent(p.v) }));
  if (pts.length === 1) pts.unshift({ x: 0, y: pts[0].y });
  const scale = (n: number) => Math.round(n * (CHART_SIZE / 100) * 10) / 10;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${scale(p.x)} ${scale(p.y)}`).join(" ");
  const area = `${line} L${scale(pts.at(-1)!.x)} ${CHART_SIZE} L${scale(pts[0].x)} ${CHART_SIZE} Z`;
  return { line, area, last: pts.at(-1)!, yPercent };
}

const NICE = [1, 2, 2.5, 5, 10];

/** A round step near `raw`: 0.0535 → 0.05, 0.13 → 0.1. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = NICE.find((n) => fraction <= n) ?? 10;
  return nice * power;
}

/** The chart's domain rounded out to whole steps, and the gridline values above its floor (three or four). */
export function niceDomain(values: readonly number[]): Domain & { step: number; ticks: number[] } {
  if (values.length === 0) return { min: 0, max: 1, step: 1, ticks: [] };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = niceStep((hi - lo || Math.abs(hi) * 0.02 || 1) / 3);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = max; v > min + step / 2; v -= step) ticks.push(Math.round(v / step) * step);
  return { min, max: max === min ? max + step : max, step, ticks };
}

/** Price points as numbers in the unit the chart shows: dollars when a rate is known, NEAR otherwise. */
export function toChartValues(points: readonly PricePoint[], usdCentsPerNear: bigint | null): { t: number; v: number }[] {
  return points.map((p) => ({
    t: p.at.getTime(),
    // Down to millionths with bigint first, so no float ever holds a 24-decimal integer.
    v: usdCentsPerNear !== null ? Number((p.yoctoNearPerCut * usdCentsPerNear) / 10n ** 20n) / 1e6 : Number(p.yoctoNearPerCut / 10n ** 18n) / 1e6,
  }));
}

/** Three tick labels: first, middle and last point time, to the minute. */
export function tickTimes(points: readonly PricePoint[]): Date[] {
  if (points.length === 0) return [];
  const first = points[0].at.getTime();
  const last = points.at(-1)!.at.getTime();
  return [first, (first + last) / 2, last].map((t) => new Date(Math.floor(t / 60_000) * 60_000));
}
