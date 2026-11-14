import { chartPath, chartY, everyNthDay, SIM_DAYS, type ScenarioKey, type SimResult } from "../model/sim";

const STROKE: Record<ScenarioKey, { color: string; width: number; dash?: string; label: string }> = {
  ghost: { color: "#9aa0ae", width: 4, label: "#6b7180" },
  top: { color: "#ff3b3b", width: 4, label: "#d2261e" },
  whale: { color: "#8b6cff", width: 4, label: "#6a4be0" },
  steady: { color: "#0052ff", width: 6, label: "#0052ff" },
  sybil: { color: "#0a0b0d", width: 2.5, dash: "7 6", label: "#0a0b0d" },
};

const DRAW_ORDER: ScenarioKey[] = ["ghost", "top", "whale", "steady", "sybil"];
const Y_TICKS = [10_000_000, 9_500_000, 9_000_000, 8_500_000, 8_000_000];

/**
 * $CUT supply every 10 days for each crowd, as drawn on the Landing (inline SVG, no chart library).
 * Labels sit at the right end of each line; Sybil swarm shares Steady's line, so its label goes under it.
 */
export function SimChart({ results }: { results: SimResult[] }) {
  const byKey = new Map(results.map((result) => [result.scenario.key, result]));
  const points = (key: ScenarioKey) => everyNthDay(byKey.get(key)?.supply ?? []);
  const last = (key: ScenarioKey) => chartY(points(key).at(-1) ?? 0);
  const days = Array.from({ length: SIM_DAYS / 10 + 1 }, (_, i) => i * 10);
  const dots = DRAW_ORDER.filter((key) => key !== "sybil").flatMap((key) => {
    const values = points(key);
    return values.map((value, index) => ({ key: `${key}-${index}`, x: 70 + (index * 546) / (values.length - 1), y: chartY(value) }));
  });
  const labels: { key: ScenarioKey; text: string; y: number }[] = [
    { key: "ghost", text: "Ghost town", y: last("ghost") + 5 },
    { key: "top", text: "Top-heavy", y: last("top") + 5 },
    { key: "whale", text: "Whale sniper", y: last("whale") + 5 },
    { key: "steady", text: "Steady", y: last("steady") - 4 },
    { key: "sybil", text: "= Sybil swarm", y: last("steady") + 14 },
  ];

  return (
    <svg viewBox="0 0 786 392" role="img" aria-label="Simulated $CUT supply over 60 daily cuts, one line per crowd" className="block h-auto w-full overflow-visible font-sans">
      <g stroke="var(--color-line)" strokeWidth="1.5">
        <path d="M70 24H616M70 104H616M70 184H616M70 264H616" />
      </g>
      <path d="M70 344H616" stroke="var(--color-ink)" strokeWidth="2" />
      <g fontSize="12.5" fontWeight="700" fill="var(--color-ink-3)" textAnchor="end">
        {Y_TICKS.map((tick) => (
          <text key={tick} x="60" y={chartY(tick) + 4}>
            {(tick / 1_000_000).toFixed(1)}M
          </text>
        ))}
      </g>
      <g fontSize="12" fontWeight="700" fill="var(--color-ink-3)" textAnchor="middle">
        {days.map((day, index) => (
          <text key={day} x={70 + (index * 546) / (days.length - 1)} y="370">
            Day {day}
          </text>
        ))}
      </g>
      {DRAW_ORDER.map((key) => {
        const stroke = STROKE[key];
        return (
          <path
            key={key}
            d={chartPath(points(key))}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeDasharray={stroke.dash}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
      <g fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2">
        {dots.map((dot) => (
          <circle key={dot.key} cx={dot.x} cy={dot.y} r="4" />
        ))}
      </g>
      <g fontSize="14" fontWeight="800">
        {labels.map((label) => (
          <text key={label.key} x="630" y={label.y} fill={STROKE[label.key].label}>
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
