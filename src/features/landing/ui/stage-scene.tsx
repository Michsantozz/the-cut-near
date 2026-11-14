import { cn } from "cn";

import { AgentPoses } from "@/entities/agent";

// The stage drawn in code, on the design's 1440 × 960 frame. The spotlights stay on the frame's
// left and everything else on its right, so a wider scene opens room in the middle. The truss, the
// floor, the cut line and the curtain run far past the frame; the section around the scene clips them.
const FAR = 2400;
const TRUSS_Y = 37;
const PIVOT = { x: 1059, y: 232 };
const PEDESTAL = { x: 1052, y: 812, rx: 143, ry: 26, side: 38 };

const BEAMS = [
  { x: 56, tilt: 250 },
  { x: 319, tilt: 270 },
  { x: 572, tilt: 290 },
];

function Beams({ uid }: { uid: string }) {
  const ref = (name: string) => `${uid}-${name}`;
  return (
    <svg aria-hidden="true" className="absolute top-0 left-0 overflow-visible" width={1440} height={960} viewBox="0 0 1440 960">
      <defs>
        <linearGradient id={ref("beam")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9d2ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#d9d2ff" stopOpacity="0" />
        </linearGradient>
        <filter id={ref("soft")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {BEAMS.map(({ x, tilt }) => (
        <polygon
          key={x}
          points={`${x},${TRUSS_Y} ${x + 46},${TRUSS_Y} ${x + tilt + 150},560 ${x + tilt - 60},560`}
          fill={`url(#${ref("beam")})`}
          filter={`url(#${ref("soft")})`}
        />
      ))}
    </svg>
  );
}

function Backdrop({ uid }: { uid: string }) {
  const ref = (name: string) => `${uid}-${name}`;
  return (
    <svg aria-hidden="true" className="absolute top-0 left-0 overflow-visible" width={1440} height={960} viewBox="0 0 1440 960">
      <defs>
        <linearGradient id={ref("cone")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff3b3b" />
          <stop offset="1" stopColor="#e3202a" stopOpacity="0.82" />
        </linearGradient>
        <pattern id={ref("truss")} width="40" height={TRUSS_Y} patternUnits="userSpaceOnUse">
          <path d={`M0 ${TRUSS_Y - 8} L20 8 L40 ${TRUSS_Y - 8}`} fill="none" stroke="#9a9aa6" strokeWidth="3" />
        </pattern>
        <pattern id={ref("folds")} width="46" height="960" patternUnits="userSpaceOnUse">
          <rect width="46" height="960" fill="#e8132b" />
          <rect x="30" width="10" height="960" fill="#ff3347" />
          <path d="M8 0 C14 300 2 600 10 960" fill="none" stroke="#0a0b0d" strokeWidth="3" />
        </pattern>
      </defs>

      <polygon points={`942,${TRUSS_Y} 1181,${TRUSS_Y} 1364,872 731,872`} fill={`url(#${ref("cone")})`} />

      <path d={`M${-FAR} 802 Q 720 742 ${1440 + FAR} 802 L ${1440 + FAR} 960 L ${-FAR} 960 Z`} fill="#7752ef" />
      <ellipse cx="1047" cy="862" rx="318" ry="46" fill="#ff3b3b" />
      <line x1={-FAR} y1="905" x2={1440 + FAR} y2="905" stroke="#ffffff" strokeWidth="5" strokeDasharray="30 18" />

      <path
        d={`M1214 ${TRUSS_Y} C1290 150 1340 260 1369 312 L1369 345 C1330 470 1300 640 1308 778 L${1440 + FAR} 778 L${1440 + FAR} ${TRUSS_Y} Z`}
        fill={`url(#${ref("folds")})`}
        stroke="#0a0b0d"
        strokeWidth="4"
      />
      <rect x="1365" y="312" width={75 + FAR} height="33" rx="6" fill="#ffc83d" stroke="#0a0b0d" strokeWidth="4" />

      <rect x={-FAR} y="0" width={1440 + 2 * FAR} height={TRUSS_Y} fill="#1c1c22" />
      <rect x={-FAR} y="0" width={1440 + 2 * FAR} height={TRUSS_Y} fill={`url(#${ref("truss")})`} />
      <rect x={-FAR} y="5" width={1440 + 2 * FAR} height="5" fill="#b9b9c4" />
      <rect x={-FAR} y={TRUSS_Y - 9} width={1440 + 2 * FAR} height="5" fill="#b9b9c4" />

      <line x1={PIVOT.x} y1={TRUSS_Y} x2={PIVOT.x} y2={PIVOT.y} stroke="#9a9aa6" strokeWidth="5" />
      <rect x={PIVOT.x - 9} y={TRUSS_Y} width="18" height="10" rx="2" fill="#b9b9c4" stroke="#0a0b0d" strokeWidth="2" />

      <g stroke="#0a0b0d" strokeWidth="5">
        <path
          d={`M${PEDESTAL.x - PEDESTAL.rx} ${PEDESTAL.y} v${PEDESTAL.side} a${PEDESTAL.rx} ${PEDESTAL.ry} 0 0 0 ${2 * PEDESTAL.rx} 0 v${-PEDESTAL.side}`}
          fill="#e45cc0"
        />
        <ellipse cx={PEDESTAL.x} cy={PEDESTAL.y} rx={PEDESTAL.rx} ry={PEDESTAL.ry} fill="#ff7ad9" />
      </g>
    </svg>
  );
}

/** One half of the scissors: a ring handle above the pivot and the blade crossing below it. */
function ScissorHalf({ side }: { side: 1 | -1 }) {
  const ring = { x: PIVOT.x - side * 80, y: PIVOT.y - 88 };
  const tip = { x: PIVOT.x + side * 168, y: PIVOT.y + 158 };
  return (
    <g className={side === 1 ? "motion-safe:animate-snip-left" : "motion-safe:animate-snip-right"} style={{ transformBox: "view-box", transformOrigin: `${PIVOT.x}px ${PIVOT.y}px` }}>
      <path
        d={`M${ring.x + side * 36} ${ring.y + 46} L${PIVOT.x - side * 10} ${PIVOT.y - 14} L${PIVOT.x + side * 14} ${PIVOT.y + 6} Q${PIVOT.x + side * 120} ${PIVOT.y + 40} ${tip.x} ${tip.y} Q${PIVOT.x + side * 40} ${PIVOT.y + 110} ${PIVOT.x - side * 18} ${PIVOT.y + 14} L${ring.x + side * 18} ${ring.y + 62} Z`}
        fill="#c6f432"
        stroke="#0a0b0d"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <ellipse cx={ring.x} cy={ring.y} rx="64" ry="70" fill="#c6f432" stroke="#0a0b0d" strokeWidth="6" />
      <ellipse cx={ring.x} cy={ring.y} rx="38" ry="44" fill="#ff3b3b" stroke="#0a0b0d" strokeWidth="6" />
    </g>
  );
}

function Scissors() {
  return (
    <svg aria-hidden="true" className="absolute top-0 left-0 overflow-visible" width={1440} height={960} viewBox="0 0 1440 960">
      <ScissorHalf side={1} />
      <ScissorHalf side={-1} />
      <circle cx={PIVOT.x} cy={PIVOT.y} r="13" fill="#b9b9c4" stroke="#0a0b0d" strokeWidth="5" />
    </svg>
  );
}

/**
 * The stage on the design's 1440 × 960 frame: spotlights, the red cone, the curtain, the scissors
 * that snip now and then, and the agent on the block trembling on its podium. Give it a wider
 * `className` width to open the stage up; the frame stays 960 tall. `uid` keeps the SVG
 * ids apart when the phone and laptop scenes are both in the page.
 */
export function StageScene({ uid, agentId, agentName, className }: { uid: string; agentId: string | null; agentName?: string; className?: string }) {
  return (
    <div className={cn("relative h-[960px] w-[1440px] bg-[#0b0a12]", className)}>
      <Beams uid={uid} />
      <div className="absolute top-0 right-0 h-[960px] w-[1440px]">
      <Backdrop uid={uid} />
      {agentId && (
        <div className="absolute bottom-[136px] left-[1052px] -translate-x-1/2">
          <AgentPoses id={agentId} alt={agentName ? `${agentName}, on the block` : ""} priority className="motion-safe:animate-tremble" imageClassName="h-[440px] w-auto" />
        </div>
      )}
      <Scissors />
      </div>
    </div>
  );
}
