import type { PricePoint } from "@/entities/market";

// The price chart as SVG paths. Pure geometry: values are numbers here because they only become pixels.

export type ChartBox = { width: number; height: number; padTop: number; padBottom: number };

export type ChartGeometry = {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
  min: number;
  max: number;
  /** y of a value inside the box. */
  y: (value: number) => number;
};

/** Points spread evenly by time; a flat or single-point series sits in the middle. */
export function chartGeometry(values: readonly { t: number; v: number }[], box: ChartBox): ChartGeometry {
  const { width, height, padTop, padBottom } = box;
  const vs = values.map((p) => p.v);
  const min = vs.length ? Math.min(...vs) : 0;
  const max = vs.length ? Math.max(...vs) : 0;
  const t0 = values[0]?.t ?? 0;
  const t1 = values.at(-1)?.t ?? 0;
  const span = max - min;
  const inner = height - padTop - padBottom;
  const y = (v: number) => (span === 0 ? padTop + inner / 2 : padTop + ((max - v) / span) * inner);
  const x = (t: number) => (t1 === t0 ? width : ((t - t0) / (t1 - t0)) * width);
  const pts = values.map((p) => ({ x: round(x(p.t)), y: round(y(p.v)) }));
  if (pts.length === 1) pts.unshift({ x: 0, y: pts[0].y });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const area = pts.length ? `${line} L${pts.at(-1)!.x} ${height} L${pts[0].x} ${height} Z` : "";
  return { line, area, last: pts.at(-1) ?? null, min, max, y };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Price points as numbers in the unit the chart shows: dollars when a rate is known, NEAR otherwise. */
export function toChartValues(points: readonly PricePoint[], usdCentsPerNear: bigint | null): { t: number; v: number }[] {
  return points.map((p) => ({
    t: p.at.getTime(),
    // yoctoNEAR → micro-units first, so the number keeps 6 digits without a float division of a huge integer.
    v: usdCentsPerNear !== null ? Number((p.yoctoNearPerCut * usdCentsPerNear) / 10n ** 20n) / 1e6 : Number(p.yoctoNearPerCut / 10n ** 18n) / 1e6,
  }));
}

/** Three tick labels: first, middle and last point time. */
export function tickTimes(points: readonly PricePoint[]): Date[] {
  if (points.length === 0) return [];
  const first = points[0].at.getTime();
  const last = points.at(-1)!.at.getTime();
  return [first, (first + last) / 2, last].map((t) => new Date(Math.floor(t / 60_000) * 60_000));
}
